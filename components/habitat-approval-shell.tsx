"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { clearAuthSession, getStoredAuthSession, type StoredAuthSession } from "@/lib/network/token-store";
import { getCurrentUser, sendOtp, verifyOtp, type UserProfile } from "@/lib/network/auth";
import { getMyHabitat, type Habitat, updateHabitat } from "@/lib/network/habitats";
import { getHabitatMentors, type MentorProfileResponse, updateMentor } from "@/lib/network/mentors";

type NavTab = "habitats" | "trainers";
type HabitatFilter = "all" | "approved" | "pending" | "rejected" | "removed";
type HabitatDecision = "approve" | "reject" | "remove";
type TrainerFilter = "all" | "approved" | "pending" | "rejected" | "removed";
type TrainerDecision = "approve" | "reject" | "remove";
type TrainerListItem = {
  id: string;
  name: string;
  email: string;
  phone: string;
  skills: string[];
  location: string;
  rating: number;
  reviews: number;
  experience: string;
  status: Exclude<TrainerFilter, "all">;
  statusLabel: string;
  source: string;
  address: string;
  bio: string;
  raw: MentorProfileResponse;
};

function formatLocation(habitat: Habitat) {
  return [habitat.addressLine, habitat.city, habitat.state, habitat.pincode].filter(Boolean).join(", ");
}

function formatTrainerLocation(trainer: MentorProfileResponse) {
  return [trainer.location, trainer.city, trainer.addressLine].filter(Boolean).join(", ");
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function resolveHabitatStatusKey(habitat: Habitat): Exclude<HabitatFilter, "all"> {
  const verificationStatus = String(habitat.verificationStatus ?? "").trim().toLowerCase();
  if (
    verificationStatus === "approved" ||
    verificationStatus === "pending" ||
    verificationStatus === "rejected" ||
    verificationStatus === "removed"
  ) {
    return verificationStatus;
  }

  const lifecycleStatus = String(habitat.status ?? "").trim().toLowerCase();
  if (lifecycleStatus === "removed") {
    return "removed";
  }
  if (lifecycleStatus === "active") {
    return "approved";
  }
  if (lifecycleStatus === "inactive") {
    return "rejected";
  }

  return "pending";
}

function resolveHabitatStatusLabel(habitat: Habitat) {
  return String(habitat.verificationStatus || habitat.status || habitat.onboardingStatus || "Pending");
}

function getHabitatSearchText(habitat: Habitat) {
  return [
    habitat.name,
    habitat.primaryContactName,
    habitat.primaryContactPhone,
    habitat.addressLine,
    habitat.city,
    habitat.state,
    habitat.pincode
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function mergeHabitatRecord(current: Habitat, next: Partial<Habitat>) {
  const merged = { ...current };

  Object.entries(next).forEach(([key, value]) => {
    if (value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "")) {
      merged[key as keyof Habitat] = value as never;
    }
  });

  return merged;
}

function getHabitatDecisionPayload(action: HabitatDecision) {
  const now = new Date().toISOString();

  if (action === "approve") {
    return {
      verificationStatus: "APPROVED",
      status: "ACTIVE",
      approvedAt: now
    };
  }

  if (action === "reject") {
    return {
      verificationStatus: "REJECTED",
      status: "INACTIVE"
    };
  }

  return {
    verificationStatus: "REMOVED",
    status: "REMOVED",
    removedAt: now,
    removalReason: "SLA_NOT_MET",
    slaStatus: "BREACHED"
  };
}

function normalizeTrainerStatus(
  status: string | undefined,
  approvedAt: string | undefined
): Exclude<TrainerFilter, "all"> {
  const value = String(status ?? "").trim().toLowerCase();

  if (!value) {
    return approvedAt ? "approved" : "pending";
  }

  if (value.includes("remove")) {
    return "removed";
  }

  if (value.includes("reject")) {
    return "rejected";
  }

  if (
    value.includes("pending") ||
    value.includes("review") ||
    value.includes("waiting") ||
    value.includes("added") ||
    value.includes("new")
  ) {
    return "pending";
  }

  if (value.includes("approve") || value.includes("verify") || value.includes("active")) {
    return "approved";
  }

  return "pending";
}

function normalizeTrainer(trainer: MentorProfileResponse): TrainerListItem {
  const name = trainer.displayName?.trim() || "Unnamed trainer";
  const skills = Array.isArray(trainer.skills)
    ? trainer.skills.filter((skill): skill is string => typeof skill === "string" && skill.trim().length > 0)
    : [];
  const rating =
    typeof trainer.rating === "number"
      ? trainer.rating
      : typeof trainer.avgRating === "number"
        ? trainer.avgRating
        : 0;
  const reviews =
    typeof trainer.reviewCount === "number"
      ? trainer.reviewCount
      : typeof trainer.reviews === "number"
        ? trainer.reviews
        : 0;
  const status = normalizeTrainerStatus(
    String(trainer.verificationStatus ?? trainer.status ?? ""),
    trainer.approvedAt
  );

  return {
    id: trainer.userId || `${name}-${trainer.phone || "trainer"}`,
    name,
    email: trainer.email || "Not provided",
    phone: trainer.phone || "Not provided",
    skills,
    location: formatTrainerLocation(trainer) || "Location not provided",
    rating,
    reviews,
    experience: typeof trainer.experienceYears === "number" ? `${trainer.experienceYears} yrs` : "Not provided",
    status,
    statusLabel: String(trainer.verificationStatus || trainer.status || status).toUpperCase(),
    source: String(trainer.source || "Habitat roster"),
    address: String(trainer.addressLine || trainer.location || trainer.city || "Address not provided"),
    bio: typeof trainer.bio === "string" ? trainer.bio : "",
    raw: trainer
  };
}

function getTrainerSearchText(trainer: TrainerListItem) {
  return [
    trainer.name,
    trainer.email,
    trainer.phone,
    trainer.location,
    trainer.address,
    trainer.source,
    trainer.skills.join(" "),
    trainer.bio
  ]
    .join(" ")
    .toLowerCase();
}

function getTrainerDecisionPayload(action: TrainerDecision) {
  const now = new Date().toISOString();

  if (action === "approve") {
    return {
      verificationStatus: "APPROVED",
      status: "ACTIVE",
      approvedAt: now
    };
  }

  if (action === "reject") {
    return {
      verificationStatus: "REJECTED",
      status: "INACTIVE"
    };
  }

  return {
    verificationStatus: "REMOVED",
    status: "REMOVED",
    removedAt: now,
    removalReason: "SLA_NOT_MET"
  };
}

export default function HabitatApprovalShell() {
  const [activeTab, setActiveTab] = useState<NavTab>("habitats");
  const [session, setSession] = useState<StoredAuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [habitats, setHabitats] = useState<Habitat[]>([]);
  const [selectedHabitatId, setSelectedHabitatId] = useState<string>("");
  const [trainers, setTrainers] = useState<MentorProfileResponse[]>([]);
  const [booting, setBooting] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string>("");
  const [habitatActionBusy, setHabitatActionBusy] = useState<HabitatDecision | "">("");
  const [habitatActionMessage, setHabitatActionMessage] = useState("");
  const [habitatActionError, setHabitatActionError] = useState("");

  const selectedHabitat = useMemo(
    () => habitats.find((item) => item.habitatId === selectedHabitatId) ?? habitats[0] ?? null,
    [habitats, selectedHabitatId]
  );

  useEffect(() => {
    const storedSession = getStoredAuthSession();
    if (!storedSession?.accessToken) {
      setBooting(false);
      return;
    }

    void hydrateSession(storedSession);
  }, []);

  useEffect(() => {
    if (!session?.accessToken || !selectedHabitat?.habitatId) {
      setTrainers([]);
      return;
    }

    void loadTrainers(selectedHabitat.habitatId);
  }, [selectedHabitat?.habitatId, session?.accessToken]);

  async function hydrateSession(nextSession: StoredAuthSession) {
    setLoadingData(true);
    setDataError("");

    try {
      const [profileResponse, habitatsResponse] = await Promise.all([
        getCurrentUser(nextSession.accessToken),
        getMyHabitat(nextSession.accessToken)
      ]);

      const nextHabitats = habitatsResponse.data ?? [];
      setSession(nextSession);
      setProfile(profileResponse.data ?? null);
      setHabitats(nextHabitats);
      setSelectedHabitatId((current: string) => current || nextHabitats[0]?.habitatId || "");
      setHabitatActionMessage("");
      setHabitatActionError("");
    } catch (error) {
      clearAuthSession();
      setSession(null);
      setProfile(null);
      setHabitats([]);
      setSelectedHabitatId("");
      setTrainers([]);
      setDataError(toErrorMessage(error));
    } finally {
      setLoadingData(false);
      setBooting(false);
    }
  }

  async function loadTrainers(habitatId: string) {
    setLoadingData(true);
    setDataError("");

    try {
      const response = await getHabitatMentors(habitatId);
      setTrainers(response.data ?? []);
    } catch (error) {
      setTrainers([]);
      setDataError(toErrorMessage(error));
    } finally {
      setLoadingData(false);
    }
  }

  function handleLogout() {
    clearAuthSession();
    setSession(null);
    setProfile(null);
    setHabitats([]);
    setSelectedHabitatId("");
    setTrainers([]);
    setDataError("");
    setHabitatActionBusy("");
    setHabitatActionMessage("");
    setHabitatActionError("");
    setActiveTab("habitats");
  }

  async function handleHabitatDecision(action: HabitatDecision) {
    if (!selectedHabitat?.habitatId) {
      return;
    }

    if (
      action !== "approve" &&
      typeof window !== "undefined" &&
      !window.confirm(
        action === "remove"
          ? "Remove this habitat for SLA breach?"
          : "Reject this habitat from the approval flow?"
      )
    ) {
      return;
    }

    const habitatId = selectedHabitat.habitatId;
    const payload = getHabitatDecisionPayload(action);

    setHabitatActionBusy(action);
    setHabitatActionError("");
    setHabitatActionMessage("");

    try {
      const response = await updateHabitat(habitatId, payload);
      const mergedHabitat = mergeHabitatRecord(
        mergeHabitatRecord(selectedHabitat, payload),
        response.data ?? {}
      );

      setHabitats((current) =>
        current.map((item) =>
          item.habitatId === habitatId ? mergeHabitatRecord(item, mergedHabitat) : item
        )
      );

      setHabitatActionMessage(
        action === "approve"
          ? "Habitat approved successfully."
          : action === "reject"
            ? "Habitat rejected successfully."
            : "Habitat removed for SLA breach."
      );
    } catch (error) {
      setHabitatActionError(toErrorMessage(error));
    } finally {
      setHabitatActionBusy("");
    }
  }

  if (!session?.accessToken) {
    return (
      <LoginView
        booting={booting}
        onLoggedIn={async (nextSession) => {
          await hydrateSession(nextSession);
        }}
      />
    );
  }

  return (
    <main className="shell">
      <div className="shell-grid">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-kicker">Timphoo Workspace</span>
            <span className="brand-title">Approval Desk</span>
            <span className="brand-copy">
              Review your habitat network and keep trainer onboarding in one focused place.
            </span>
          </div>

          <nav className="nav" aria-label="Primary">
            <button
              className={`nav-button ${activeTab === "habitats" ? "is-active" : ""}`}
              onClick={() => setActiveTab("habitats")}
              type="button"
            >
              <span className="nav-icon">🏕️</span>
              <span className="nav-label">Habitats</span>
            </button>
            <button
              className={`nav-button ${activeTab === "trainers" ? "is-active" : ""}`}
              onClick={() => setActiveTab("trainers")}
              type="button"
            >
              <span className="nav-icon">🧑‍🏫</span>
              <span className="nav-label">Trainers</span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="user-chip">
              <strong>{profile?.displayName || profile?.phone || "Logged in"}</strong>
              <span>{profile?.userType || "HABITAT_ADMIN"}</span>
            </div>
            <div className="status-chip">
              <strong>{habitats.length} linked habitats</strong>
              <span>{selectedHabitat?.name || "Pick a habitat to view trainers"}</span>
            </div>
            <button className="logout-button" onClick={handleLogout} type="button">
              Log out
            </button>
          </div>
        </aside>

        <section className="content">
          <div className="content-panel">
            <div className="hero">
              <div>
                <div className="pill">
                  {activeTab === "habitats" ? "Habitat approvals" : "Trainer approvals"}
                </div>
                <h1>
                  {activeTab === "habitats"
                    ? "Habitats connected to your account"
                    : "Trainers linked to the selected habitat"}
                </h1>
                <p>
                  {activeTab === "habitats"
                    ? "This view is powered by the same OTP login flow as the admin app and loads the habitats available to the signed-in account."
                    : "Switch habitats below to review trainer records for the currently selected location."}
                </p>
              </div>
            </div>

            {dataError ? <div className="section"><div className="message error">{dataError}</div></div> : null}

            {activeTab === "habitats" ? (
              <HabitatsView
                habitats={habitats}
                selectedHabitat={selectedHabitat}
                selectedHabitatId={selectedHabitat?.habitatId ?? ""}
                onSelectHabitat={(habitatId) => setSelectedHabitatId(habitatId)}
                onApprove={() => void handleHabitatDecision("approve")}
                onReject={() => void handleHabitatDecision("reject")}
                onRemove={() => void handleHabitatDecision("remove")}
                actionBusy={habitatActionBusy}
                actionMessage={habitatActionMessage}
                actionError={habitatActionError}
                loading={loadingData}
              />
            ) : (
              <TrainersView
                habitats={habitats}
                selectedHabitatId={selectedHabitat?.habitatId ?? ""}
                onSelectHabitat={(habitatId) => setSelectedHabitatId(habitatId)}
                trainers={trainers}
                loading={loadingData}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function LoginView({
  booting,
  onLoggedIn
}: {
  booting: boolean;
  onLoggedIn: (session: StoredAuthSession) => Promise<void>;
}) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSendOtp() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await sendOtp(phone);
      setOtpSent(true);
      setMessage("OTP sent successfully. Enter the code to continue.");
    } catch (sendError) {
      setError(toErrorMessage(sendError));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await verifyOtp({
        phone,
        otp,
        userType: "HABITAT_ADMIN"
      });

      if (!response.data?.accessToken) {
        throw new Error("OTP verified, but no session was returned.");
      }

      await onLoggedIn({
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        userId: response.data.userId,
        userType: response.data.userType,
        deviceId: response.data.deviceId
      });
    } catch (verifyError) {
      setError(toErrorMessage(verifyError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="login-kicker">Timphoo Habitat Approval</p>
        <h1>Sign in with OTP</h1>
        <p>
          This app uses the same `sendOtp` and `verifyOtp` module flow from the admin project, adapted
          here for the approval workspace.
        </p>

        <div className="form">
          <div className="field">
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone"
              inputMode="tel"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.target.value)}
              placeholder="Enter mobile number"
              value={phone}
            />
          </div>

          {otpSent ? (
            <div className="field">
              <label htmlFor="otp">OTP</label>
              <input
                id="otp"
                inputMode="numeric"
                maxLength={6}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setOtp(event.target.value)}
                placeholder="Enter 6-digit OTP"
                value={otp}
              />
            </div>
          ) : null}

          {error ? <div className="message error">{error}</div> : null}
          {message ? <div className="message success">{message}</div> : null}

          <div className="form-row">
            <button
              className="primary-button"
              disabled={busy || phone.trim().length < 10}
              onClick={otpSent ? handleVerifyOtp : handleSendOtp}
              type="button"
            >
              {booting || busy ? "Please wait..." : otpSent ? "Verify OTP" : "Send OTP"}
            </button>

            {otpSent ? (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={handleSendOtp}
                type="button"
              >
                Resend OTP
              </button>
            ) : null}
          </div>

          <div className="helper-row">
            <span className="meta-value">User type: HABITAT_ADMIN</span>
            {otpSent ? (
              <button
                className="inline-button"
                disabled={busy}
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                  setError("");
                  setMessage("");
                }}
                type="button"
              >
                Change phone
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function HabitatsView({
  habitats,
  selectedHabitat,
  selectedHabitatId,
  onSelectHabitat,
  onApprove,
  onReject,
  onRemove,
  actionBusy,
  actionMessage,
  actionError,
  loading
}: {
  habitats: Habitat[];
  selectedHabitat: Habitat | null;
  selectedHabitatId: string;
  onSelectHabitat: (habitatId: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onRemove: () => void;
  actionBusy: HabitatDecision | "";
  actionMessage: string;
  actionError: string;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HabitatFilter>("pending");
  const [openedHabitatId, setOpenedHabitatId] = useState("");

  const shownHabitats = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return habitats.filter((habitat) => {
      const statusKey = resolveHabitatStatusKey(habitat);
      const matchesStatus = statusFilter === "all" || statusKey === statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0 || getHabitatSearchText(habitat).includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [habitats, search, statusFilter]);

  const pendingCount = habitats.filter((habitat) => resolveHabitatStatusKey(habitat) === "pending").length;
  const approvedCount = habitats.filter((habitat) => resolveHabitatStatusKey(habitat) === "approved").length;
  const openedHabitat = habitats.find((habitat) => habitat.habitatId === openedHabitatId) ?? null;
  const openedHabitatStatus = openedHabitat ? resolveHabitatStatusKey(openedHabitat) : null;

  useEffect(() => {
    if (!openedHabitatId) {
      return;
    }

    const hasOpenedVisibleHabitat = shownHabitats.some((habitat) => habitat.habitatId === openedHabitatId);
    if (!hasOpenedVisibleHabitat) {
      setOpenedHabitatId("");
    }
  }, [openedHabitatId, shownHabitats]);

  return (
    <div className="section">
      <div className="toolbar">
        <h2 className="section-title">Habitats</h2>
        <div className="pill">{loading ? "Refreshing..." : `${shownHabitats.length} records`}</div>
      </div>

      {pendingCount > 0 ? (
        <div className="status-banner">
          <strong>{pendingCount} habitat approvals are waiting for review.</strong>
          <span>{approvedCount} habitats are currently approved.</span>
        </div>
      ) : null}

      {actionError ? <div className="message error">{actionError}</div> : null}
      {actionMessage ? <div className="message success">{actionMessage}</div> : null}

      {habitats.length === 0 ? (
        <div className="empty-state">No habitats were returned for this account yet.</div>
      ) : (
        <div className={`review-grid ${openedHabitat ? "has-detail" : ""}`}>
          <div>
            <div className="filter-row">
              <div className="search-shell">
                <span className="search-icon">⌕</span>
                <input
                  className="search-input"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                  placeholder="Search habitats, contact or location"
                  value={search}
                />
              </div>
              <div className="filter-pills">
                {[
                  ["all", "All"],
                  ["approved", "Approved"],
                  ["pending", "Pending"],
                  ["rejected", "Rejected"],
                  ["removed", "Removed"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`filter-pill ${statusFilter === value ? "is-active" : ""}`}
                    onClick={() => setStatusFilter(value as HabitatFilter)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-card">
              <div className="table-wrap">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>Habitat</th>
                      <th>Location</th>
                      <th>Primary Contact</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 5 }).map((_, index) => (
                          <tr key={`habitat-skeleton-${index}`}>
                            <td><div className="row-skel wide" /></td>
                            <td><div className="row-skel" /></td>
                            <td><div className="row-skel" /></td>
                            <td><div className="row-skel pill" /></td>
                            <td><div className="row-skel tiny" /></td>
                          </tr>
                        ))
                      : null}

                    {!loading
                      ? shownHabitats.map((habitat) => (
                          <tr
                            className={selectedHabitatId === habitat.habitatId ? "is-selected" : ""}
                            key={habitat.habitatId || habitat.name}
                            onClick={() => {
                              onSelectHabitat(habitat.habitatId || "");
                              setOpenedHabitatId(habitat.habitatId || "");
                            }}
                          >
                            <td>
                              <div className="table-primary">
                                <strong>{habitat.name || "Unnamed habitat"}</strong>
                                <span>{habitat.type || "Habitat"}</span>
                              </div>
                            </td>
                            <td>{formatLocation(habitat) || "Not available"}</td>
                            <td>{habitat.primaryContactName || habitat.primaryContactPhone || "Not available"}</td>
                            <td>
                              <span className={`status-chip-ui status-${resolveHabitatStatusKey(habitat)}`}>
                                {resolveHabitatStatusLabel(habitat)}
                              </span>
                            </td>
                            <td>
                              <button
                                className="table-link"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onSelectHabitat(habitat.habitatId || "");
                                  setOpenedHabitatId(habitat.habitatId || "");
                                }}
                                type="button"
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        ))
                      : null}

                    {!loading && shownHabitats.length === 0 ? (
                      <tr>
                        <td className="empty-cell" colSpan={5}>
                          {habitats.length === 0
                            ? "No habitats available yet."
                            : "No habitats match the current search or status filter."}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {openedHabitat ? (
            <aside className="detail-panel">
              <div className="detail-top">
                <div>
                  <div className="detail-title">{openedHabitat.name || "Unnamed habitat"}</div>
                  <div className="detail-subtitle">{formatLocation(openedHabitat) || "Location not available"}</div>
                </div>
                <span className={`status-chip-ui status-${resolveHabitatStatusKey(openedHabitat)}`}>
                  {resolveHabitatStatusLabel(openedHabitat)}
                </span>
              </div>

              <div className="detail-stack">
                {[
                  ["Habitat ID", openedHabitat.habitatId || "Unavailable"],
                  ["Primary Contact", openedHabitat.primaryContactName || "Unavailable"],
                  ["Phone", openedHabitat.primaryContactPhone || "Unavailable"],
                  ["Current Status", resolveHabitatStatusLabel(openedHabitat)],
                  ["Created", openedHabitat.createdAt ? new Date(openedHabitat.createdAt).toLocaleString() : "Unavailable"]
                ].map(([label, value]) => (
                  <div className="detail-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <div className="detail-copy">
                {openedHabitat.description || "No additional habitat description is available yet."}
              </div>

              <div className="action-stack">
                {openedHabitatStatus !== "approved" ? (
                  <button
                    className="primary-button"
                    disabled={actionBusy !== ""}
                    onClick={onApprove}
                    type="button"
                  >
                    {actionBusy === "approve" ? "Approving..." : "Approve Habitat"}
                  </button>
                ) : null}
                <button
                  className="secondary-button"
                  disabled={actionBusy !== ""}
                  onClick={onReject}
                  type="button"
                >
                  {actionBusy === "reject" ? "Rejecting..." : "Reject Habitat"}
                </button>
                {openedHabitatStatus !== "approved" ? (
                  <button
                    className="danger-button"
                    disabled={actionBusy !== ""}
                    onClick={onRemove}
                    type="button"
                  >
                    {actionBusy === "remove" ? "Removing..." : "Remove For SLA Breach"}
                  </button>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TrainersView({
  habitats,
  selectedHabitatId,
  onSelectHabitat,
  trainers,
  loading
}: {
  habitats: Habitat[];
  selectedHabitatId: string;
  onSelectHabitat: (habitatId: string) => void;
  trainers: MentorProfileResponse[];
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TrainerFilter>("pending");
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [openedTrainerId, setOpenedTrainerId] = useState("");
  const [actionBusy, setActionBusy] = useState<TrainerDecision | "">("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [localTrainers, setLocalTrainers] = useState<MentorProfileResponse[]>(trainers);

  useEffect(() => {
    setLocalTrainers(trainers);
  }, [trainers]);

  const normalizedTrainers = useMemo(
    () => localTrainers.map((trainer) => normalizeTrainer(trainer)),
    [localTrainers]
  );

  const shownTrainers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return normalizedTrainers.filter((trainer) => {
      const matchesStatus = statusFilter === "all" || trainer.status === statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0 || getTrainerSearchText(trainer).includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [normalizedTrainers, search, statusFilter]);

  useEffect(() => {
    if (!openedTrainerId) {
      return;
    }

    const hasOpenedVisibleTrainer = shownTrainers.some((trainer) => trainer.id === openedTrainerId);
    if (!hasOpenedVisibleTrainer) {
      setOpenedTrainerId("");
      setSelectedTrainerId("");
    }
  }, [openedTrainerId, shownTrainers]);

  const selectedTrainer =
    normalizedTrainers.find((trainer) => trainer.id === selectedTrainerId) ?? normalizedTrainers[0] ?? null;
  const openedTrainer =
    normalizedTrainers.find((trainer) => trainer.id === openedTrainerId) ?? null;
  const pendingCount = normalizedTrainers.filter((trainer) => trainer.status === "pending").length;
  const approvedCount = normalizedTrainers.filter((trainer) => trainer.status === "approved").length;

  async function handleTrainerDecision(action: TrainerDecision) {
    if (!selectedTrainer) {
      return;
    }

    if (
      action !== "approve" &&
      typeof window !== "undefined" &&
      !window.confirm(
        action === "remove"
          ? "Remove this trainer from the roster?"
          : "Reject this trainer from the approval flow?"
      )
    ) {
      return;
    }

    const payload = getTrainerDecisionPayload(action);
    setActionBusy(action);
    setActionError("");
    setActionMessage("");

    try {
      const response = await updateMentor(selectedTrainer.id, payload);
      const mergedTrainer = {
        ...selectedTrainer.raw,
        ...payload,
        ...(response.data ?? {})
      };

      setLocalTrainers((current) =>
        current.map((trainer) =>
          (trainer.userId || `${trainer.displayName || "trainer"}-${trainer.phone || "trainer"}`) === selectedTrainer.id
            ? mergedTrainer
            : trainer
        )
      );

      setActionMessage(
        action === "approve"
          ? "Trainer approved successfully."
          : action === "reject"
            ? "Trainer rejected successfully."
            : "Trainer removed successfully."
      );
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setActionBusy("");
    }
  }

  return (
    <div className="section">
      <div className="toolbar">
        <h2 className="section-title">Trainers</h2>
        <div className="helper-row">
          <select
            aria-label="Select habitat"
            className="inline-button"
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectHabitat(event.target.value)}
            value={selectedHabitatId}
          >
            {habitats.length === 0 ? <option value="">No habitats</option> : null}
            {habitats.map((habitat) => (
              <option key={habitat.habitatId || habitat.name} value={habitat.habitatId || ""}>
                {habitat.name || "Unnamed habitat"}
              </option>
            ))}
          </select>
          <div className="pill">{loading ? "Refreshing..." : `${shownTrainers.length} trainers`}</div>
        </div>
      </div>

      {selectedHabitatId && pendingCount > 0 ? (
        <div className="status-banner">
          <strong>{pendingCount} trainers are waiting for review.</strong>
          <span>{approvedCount} trainers are currently approved for this habitat.</span>
        </div>
      ) : null}

      {actionError ? <div className="message error">{actionError}</div> : null}
      {actionMessage ? <div className="message success">{actionMessage}</div> : null}

      {selectedHabitatId ? null : (
        <div className="empty-state">Select a habitat first to load trainer data.</div>
      )}

      {selectedHabitatId && normalizedTrainers.length === 0 && !loading ? (
        <div className="empty-state">No trainers were returned for the selected habitat.</div>
      ) : null}

      {selectedHabitatId && normalizedTrainers.length > 0 ? (
        <div className={`review-grid ${openedTrainer ? "has-detail" : ""}`}>
          <div>
            <div className="filter-row">
              <div className="search-shell">
                <span className="search-icon">⌕</span>
                <input
                  className="search-input"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                  placeholder="Search trainers, skill or location"
                  value={search}
                />
              </div>
              <div className="filter-pills">
                {[
                  ["all", "All"],
                  ["approved", "Approved"],
                  ["pending", "Pending"],
                  ["rejected", "Rejected"],
                  ["removed", "Removed"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`filter-pill ${statusFilter === value ? "is-active" : ""}`}
                    onClick={() => setStatusFilter(value as TrainerFilter)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-card">
              <div className="table-wrap">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>Trainer</th>
                      <th>Skills</th>
                      <th>Experience</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 5 }).map((_, index) => (
                          <tr key={`trainer-skeleton-${index}`}>
                            <td><div className="row-skel wide" /></td>
                            <td><div className="row-skel" /></td>
                            <td><div className="row-skel" /></td>
                            <td><div className="row-skel pill" /></td>
                            <td><div className="row-skel tiny" /></td>
                          </tr>
                        ))
                      : null}

                    {!loading
                      ? shownTrainers.map((trainer) => (
                          <tr
                            className={openedTrainer?.id === trainer.id ? "is-selected" : ""}
                            key={trainer.id}
                            onClick={() => {
                              setSelectedTrainerId(trainer.id);
                              setOpenedTrainerId(trainer.id);
                            }}
                          >
                            <td>
                              <div className="table-primary">
                                <strong>{trainer.name}</strong>
                                <span>{trainer.location}</span>
                              </div>
                            </td>
                            <td>
                              {trainer.skills.length > 0
                                ? trainer.skills.slice(0, 3).join(", ")
                                : "No skills added"}
                            </td>
                            <td>{trainer.experience}</td>
                            <td>
                              <span className={`status-chip-ui status-${trainer.status}`}>
                                {trainer.statusLabel}
                              </span>
                            </td>
                            <td>
                              <button
                                className="table-link"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedTrainerId(trainer.id);
                                  setOpenedTrainerId(trainer.id);
                                }}
                                type="button"
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        ))
                      : null}

                    {!loading && shownTrainers.length === 0 ? (
                      <tr>
                        <td className="empty-cell" colSpan={5}>
                          No trainers match the current search or status filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {openedTrainer ? (
            <aside className="detail-panel">
              <div className="detail-top">
                <div>
                  <div className="detail-title">{openedTrainer.name}</div>
                  <div className="detail-subtitle">{openedTrainer.location}</div>
                </div>
                <span className={`status-chip-ui status-${openedTrainer.status}`}>
                  {openedTrainer.statusLabel}
                </span>
              </div>

              <div className="detail-stack">
                {[
                  ["Email", openedTrainer.email],
                  ["Phone", openedTrainer.phone],
                  ["Experience", openedTrainer.experience],
                  ["Source", openedTrainer.source],
                  ["Address", openedTrainer.address]
                ].map(([label, value]) => (
                  <div className="detail-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <div className="detail-copy">
                {openedTrainer.bio || "No additional trainer bio is available yet."}
              </div>

              <div className="detail-tags">
                {openedTrainer.skills.length > 0 ? (
                  openedTrainer.skills.map((skill) => (
                    <span className="skill-chip" key={skill}>{skill}</span>
                  ))
                ) : (
                  <span className="skill-chip muted">No skills added</span>
                )}
              </div>

              <div className="action-stack">
                <button
                  className="primary-button"
                  disabled={actionBusy !== ""}
                  onClick={() => void handleTrainerDecision("approve")}
                  type="button"
                >
                  {actionBusy === "approve" ? "Approving..." : "Approve Trainer"}
                </button>
                <button
                  className="secondary-button"
                  disabled={actionBusy !== ""}
                  onClick={() => void handleTrainerDecision("reject")}
                  type="button"
                >
                  {actionBusy === "reject" ? "Rejecting..." : "Reject Trainer"}
                </button>
                <button
                  className="danger-button"
                  disabled={actionBusy !== ""}
                  onClick={() => void handleTrainerDecision("remove")}
                  type="button"
                >
                  {actionBusy === "remove" ? "Removing..." : "Remove Trainer"}
                </button>
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
