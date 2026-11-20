import { useState, type FormEvent } from "react";
import { KeyRound, MailCheck, User } from "lucide-react";
import type { AuthUser } from "@/contexts/AuthContext";
import type { Consultant } from "@/types";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ProfileSecurityCardProps {
  user: AuthUser | null;
  consultants: Consultant[];
}

export function ProfileSecurityCard({ user, consultants }: ProfileSecurityCardProps) {
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [passwordCodeSent, setPasswordCodeSent] = useState(false);
  const [passwordCode, setPasswordCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const requestPasswordCodeMutation = trpc.auth.requestPasswordChangeCode.useMutation({
    onSuccess: (result) => {
      setPasswordCodeSent(true);
      toast.success(result.delivery === "console" ? "Verification code generated. Check the backend console." : "Verification code sent to your account email.");
    },
    onError: (error) => toast.error(error.message),
  });
  const changePasswordMutation = trpc.auth.changePasswordWithCode.useMutation({
    onSuccess: () => {
      setPasswordChangeOpen(false);
      setPasswordCodeSent(false);
      setPasswordCode("");
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success("Your password has been changed.");
    },
    onError: (error) => toast.error(error.message),
  });

  const resetPasswordForm = () => {
    setPasswordChangeOpen(false);
    setPasswordCodeSent(false);
    setPasswordCode("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  const submitPasswordChange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordCode.length !== 6) {
      toast.error("Enter the full 6-digit verification code from your email.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Your new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("The passwords do not match.");
      return;
    }
    changePasswordMutation.mutate({ code: passwordCode, password: newPassword });
  };

  return (
    <article className="panel settings-card">
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <User size={20} color="#2B6CB0" />
        <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>User Profile</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px" }}>
        <div>
          <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>Display Name</span>
          <strong>{user?.name || "Not provided"}</strong>
        </div>
        <div>
          <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>Employee ID</span>
          <strong>{user?.employeeId ?? "—"}</strong>
        </div>
        <div>
          <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>Email Address</span>
          <span>{user?.email || "No email on record"}</span>
        </div>
        <div>
          <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>Assigned Role</span>
          <span className="badge" style={{ background: "#E2E8F0", fontWeight: 700, textTransform: "uppercase" }}>
            {user?.role || "unassigned"}
          </span>
        </div>
        {user?.consultantId && (
          <div>
            <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>Linked Consultant</span>
            <span style={{ color: "#2B6CB0", fontWeight: 600 }}>
              {consultants.find((consultant) => consultant.id === user.consultantId)?.name || user.consultantId}
            </span>
          </div>
        )}
      </div>

      <section className="profile-password-section" aria-label="Password settings">
        <div className="profile-password-heading">
          <div><KeyRound size={16} /><strong>Password</strong></div>
          <button type="button" className="button button-quiet" onClick={() => passwordChangeOpen ? resetPasswordForm() : setPasswordChangeOpen(true)}>
            {passwordChangeOpen ? "Cancel" : "Change password"}
          </button>
        </div>
        {passwordChangeOpen && !passwordCodeSent && <div className="profile-password-prompt">
          <p>A one-time code will be sent to <strong>{user?.email || "your account email"}</strong>. It expires in 10 minutes.</p>
          <button type="button" className="button button-primary" disabled={!user?.email || requestPasswordCodeMutation.isPending} onClick={() => requestPasswordCodeMutation.mutate()}>
            <MailCheck size={15} />{requestPasswordCodeMutation.isPending ? "Sending code…" : "Send verification code"}
          </button>
        </div>}
        {passwordChangeOpen && passwordCodeSent && <form className="profile-password-form" onSubmit={submitPasswordChange}>
          <label><span>6-digit verification code</span><input value={passwordCode} onChange={(event) => setPasswordCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /><small className={passwordCode.length === 6 ? "is-complete" : ""}>{passwordCode.length} of 6 digits entered</small></label>
          <label><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" maxLength={128} required /></label>
          <label><span>Confirm new password</span><input type="password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} autoComplete="new-password" maxLength={128} required /></label>
          <div className="profile-password-form-actions">
            <button type="button" className="button button-quiet" disabled={requestPasswordCodeMutation.isPending} onClick={() => requestPasswordCodeMutation.mutate()}>{requestPasswordCodeMutation.isPending ? "Sending…" : "Resend code"}</button>
            <button type="submit" className="button button-primary" disabled={changePasswordMutation.isPending || passwordCode.length !== 6 || newPassword.length < 8}>{changePasswordMutation.isPending ? "Updating…" : "Update password"}</button>
          </div>
        </form>}
      </section>
    </article>
  );
}
