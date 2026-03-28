"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { clearAuthSession, getStoredAuthSession, type StoredAuthSession } from "@/lib/network/token-store";
import { getCurrentUser, sendOtp, verifyOtp, type UserProfile } from "@/lib/network/auth";
import { getMyHabitat, type Habitat } from "@/lib/network/habitats";
import { getHabitatMentors, type MentorProfileResponse } from "@/lib/network/mentors";

type NavTab = "habitats" | "trainers";

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
    setActiveTab("habitats");
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
                selectedHabitatId={selectedHabitat?.habitatId ?? ""}
                onSelectHabitat={(habitatId) => setSelectedHabitatId(habitatId)}
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
  selectedHabitatId,
  onSelectHabitat,
  loading
}: {
  habitats: Habitat[];
  selectedHabitatId: string;
  onSelectHabitat: (habitatId: string) => void;
  loading: boolean;
}) {
  return (
    <div className="section">
      <div className="toolbar">
        <h2 className="section-title">Habitats</h2>
        <div className="pill">{loading ? "Refreshing..." : `${habitats.length} records`}</div>
      </div>

      {habitats.length === 0 ? (
        <div className="empty-state">No habitats were returned for this account yet.</div>
      ) : (
        <div className="card-grid">
          {habitats.map((habitat) => (
            <button
              key={habitat.habitatId || habitat.name}
              className={`info-card ${selectedHabitatId === habitat.habitatId ? "is-selected" : ""}`}
              onClick={() => onSelectHabitat(habitat.habitatId || "")}
              type="button"
            >
              <h3>{habitat.name || "Unnamed habitat"}</h3>
              <div className="meta-list">
                <div className="meta-row">
                  <span className="meta-label">Status</span>
                  <span className="meta-value">
                    {habitat.verificationStatus || habitat.onboardingStatus || habitat.status || "Pending"}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Primary Contact</span>
                  <span className="meta-value">
                    {habitat.primaryContactName || habitat.primaryContactPhone || "Not available"}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Location</span>
                  <span className="meta-value">{formatLocation(habitat) || "Not available"}</span>
                </div>
              </div>
            </button>
          ))}
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
          <div className="pill">{loading ? "Refreshing..." : `${trainers.length} trainers`}</div>
        </div>
      </div>

      {selectedHabitatId ? null : (
        <div className="empty-state">Select a habitat first to load trainer data.</div>
      )}

      {selectedHabitatId && trainers.length === 0 && !loading ? (
        <div className="empty-state">No trainers were returned for the selected habitat.</div>
      ) : null}

      {trainers.length > 0 ? (
        <div className="card-grid">
          {trainers.map((trainer) => (
            <article className="info-card" key={trainer.userId || trainer.phone || trainer.displayName}>
              <h3>{trainer.displayName || "Unnamed trainer"}</h3>
              <div className="meta-list">
                <div className="meta-row">
                  <span className="meta-label">Phone</span>
                  <span className="meta-value">{trainer.phone || "Not available"}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Verification</span>
                  <span className="meta-value">{trainer.verificationStatus || "Unknown"}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Skills</span>
                  <span className="meta-value">
                    {Array.isArray(trainer.skills) && trainer.skills.length > 0
                      ? trainer.skills.join(", ")
                      : trainer.bio || "Not available"}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Location</span>
                  <span className="meta-value">{formatTrainerLocation(trainer) || "Not available"}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
