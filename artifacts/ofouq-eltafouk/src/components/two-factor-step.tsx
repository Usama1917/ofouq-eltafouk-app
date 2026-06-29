import { useState, type CSSProperties } from "react";
import { ShieldCheck, Phone, RefreshCw, ArrowRight } from "lucide-react";
import { useAuth, type AuthUser, type LoginResult } from "@/contexts/auth-context";

type PendingTwoFactor = Exclude<LoginResult, { status: "authenticated" }>;

// Second step of a staff web login when two-factor SMS is enabled. Handles both the
// normal OTP step and the first-time phone-collection-then-verify flow, then hands
// the established session back to the page via onAuthenticated. Themed light/dark so
// it can drop into either the admin (/login) or owner (/owner-login) page.
export function TwoFactorStep({
  pending,
  theme = "light",
  accentStyle,
  onAuthenticated,
  onCancel,
}: {
  pending: PendingTwoFactor;
  theme?: "light" | "dark";
  accentStyle?: CSSProperties;
  onAuthenticated: (user: AuthUser) => void;
  onCancel: () => void;
}) {
  const { completeOtp, startPhoneSetup, completePhoneVerify, resendOtp } = useAuth();
  const verifyMode: "login" | "phone" = pending.status === "otp" ? "login" : "phone";

  const [phase, setPhase] = useState<"phone" | "code">(pending.status === "otp" ? "code" : "phone");
  const [challengeId, setChallengeId] = useState(pending.status === "otp" ? pending.challengeId : "");
  const [masked, setMasked] = useState(pending.status === "otp" ? pending.maskedDestination : "");
  const [devCode, setDevCode] = useState<string | undefined>(pending.status === "otp" ? pending.devCode : undefined);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const dark = theme === "dark";
  const labelCls = dark ? "text-sm font-semibold text-slate-300" : "text-sm font-semibold text-slate-600";
  const hintCls = dark ? "text-xs text-slate-400" : "text-xs text-slate-500";
  const inputCls = dark
    ? "w-full px-4 py-3.5 rounded-2xl outline-none text-white placeholder-slate-500 font-medium text-sm"
    : "w-full px-4 py-3 rounded-2xl outline-none text-sm border border-slate-300 bg-white text-slate-900";
  const inputStyle: CSSProperties | undefined = dark
    ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }
    : undefined;
  const primaryStyle: CSSProperties = accentStyle ?? { background: "hsl(217 91% 45%)", color: "#fff" };

  const submitPhone = async () => {
    if (phone.trim().length < 6) {
      setError("اكتب رقم هاتف صحيح");
      return;
    }
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const ticket = pending.status === "phone_setup" ? pending.setupTicket : "";
      const ch = await startPhoneSetup(ticket, phone.trim());
      setChallengeId(ch.challengeId);
      setMasked(ch.maskedDestination);
      setDevCode(ch.devCode);
      setCode("");
      setPhase("code");
    } catch (err: any) {
      setError(err?.message || "تعذّر حفظ الرقم");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (code.trim().length < 4) {
      setError("اكتب كود التحقق");
      return;
    }
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const user =
        verifyMode === "phone"
          ? await completePhoneVerify(challengeId, code.trim())
          : await completeOtp(challengeId, code.trim());
      onAuthenticated(user);
    } catch (err: any) {
      setError(err?.message || "الكود غير صحيح");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const ch = await resendOtp(challengeId);
      setChallengeId(ch.challengeId);
      setMasked(ch.maskedDestination);
      setDevCode(ch.devCode);
      setInfo("تم إرسال كود جديد.");
    } catch (err: any) {
      setError(err?.message || "تعذّر إرسال كود جديد");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5" style={{ color: dark ? "#fbbf24" : "hsl(217 91% 45%)" }} />
        <h2 className={dark ? "text-lg font-black text-white" : "text-lg font-black text-slate-900"}>التحقق بخطوتين</h2>
      </div>

      {error && (
        <div
          className="text-sm font-medium px-4 py-3 rounded-2xl"
          style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.3)", color: dark ? "#fca5a5" : "#b91c1c" }}
        >
          {error}
        </div>
      )}

      {phase === "phone" ? (
        <>
          <p className={labelCls}>لتأمين حسابك، أضف رقم هاتفك وسنرسل كود تحقق إليه.</p>
          <div className="relative">
            <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ""))}
              className={`${inputCls} pr-11`}
              style={inputStyle}
              placeholder="01xxxxxxxxx"
              inputMode="tel"
              dir="ltr"
            />
          </div>
          <button
            type="button"
            onClick={submitPhone}
            disabled={busy}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={primaryStyle}
          >
            {busy ? "..." : "إرسال الكود"} <ArrowRight className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          {masked ? <p className={labelCls}>أرسلنا كودًا عبر رسالة نصية إلى {masked}</p> : null}
          {devCode ? <p className={hintCls}>كود التجربة (وضع التطوير): {devCode}</p> : null}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
            className={`${inputCls} text-center tracking-[0.4em]`}
            style={inputStyle}
            placeholder="------"
            inputMode="numeric"
            maxLength={8}
            dir="ltr"
            autoFocus
          />
          <button
            type="button"
            onClick={submitCode}
            disabled={busy}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={primaryStyle}
          >
            {busy ? "..." : "تأكيد وتسجيل الدخول"}
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={busy}
            className={`w-full text-sm font-bold flex items-center justify-center gap-1.5 ${dark ? "text-amber-300" : "text-primary"} disabled:opacity-60`}
          >
            <RefreshCw className="w-3.5 h-3.5" /> لم يصلك الكود؟ إرسال كود جديد
          </button>
        </>
      )}

      {info ? <p className={`text-sm text-center ${dark ? "text-amber-300" : "text-emerald-600"}`}>{info}</p> : null}

      <button type="button" onClick={onCancel} className={`w-full text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
        رجوع
      </button>
    </div>
  );
}
