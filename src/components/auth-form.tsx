"use client";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "./password-input";
import { Logo } from "./a2-ui";
import { createClient } from "@/lib/supabase/client";
import { z } from "zod";
import { useRouter } from "next/navigation";
export function AuthForm({
  mode,
  configured,
}: {
  mode: "login" | "recovery" | "activate";
  configured: boolean;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  useEffect(() => {
    if (mode === "activate" && configured) {
      void createClient()
        .auth.getUser()
        .then(({ data }) => setInviteEmail(data.user?.email ?? ""));
    }
  }, [mode, configured]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    const data = new FormData(event.currentTarget),
      email = String(data.get("email") ?? ""),
      password = String(data.get("password") ?? "");
    if (mode !== "activate" && !z.email().safeParse(email).success) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (mode !== "recovery" && !password) {
      setError("Informe sua senha.");
      return;
    }
    if (
      mode === "activate" &&
      (password.length < 12 ||
        !/[A-Z]/.test(password) ||
        !/[0-9]/.test(password))
    ) {
      setError("Use 12 ou mais caracteres, uma letra maiúscula e um número.");
      return;
    }
    if (mode === "activate" && password !== data.get("confirmation")) {
      setError("As senhas não conferem.");
      return;
    }
    if (!configured) {
      setError(
        "Autenticação indisponível. Configure o Supabase para continuar.",
      );
      return;
    }
    setBusy(true);
    try {
      const client = createClient(
        mode === "login" ? !!data.get("remember") : undefined,
      );
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error)
          throw Error("Não foi possível entrar. Verifique e-mail e senha.");
        router.push("/dashboard");
        router.refresh();
      } else if (mode === "recovery") {
        const { error: recoveryError } =
          await client.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=/primeiro-acesso`,
          });
        if (
          recoveryError &&
          recoveryError.status &&
          recoveryError.status >= 500
        )
          throw Error("Serviço indisponível. Tente novamente mais tarde.");
        setNotice(
          "Se houver uma conta associada, você receberá as instruções por e-mail.",
        );
      } else {
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!user)
          throw Error(
            "Abra o link seguro de convite ou recuperação recebido por e-mail.",
          );
        const { error } = await client.auth.updateUser({ password });
        if (error)
          throw Error(
            "Não foi possível definir a senha. Solicite um novo link.",
          );
        setNotice(
          "Senha definida com sucesso. Sua conta está pronta para entrar.",
        );
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Serviço indisponível. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "login"
      ? "Bem-vindo de volta"
      : mode === "recovery"
        ? "Recuperar senha"
        : "Ative sua conta";
  return (
    <main className="auth-page">
      <section className={`auth-card ${mode}-card`}>
        <Logo />
        <h1>{title}</h1>
        <p className="auth-subtitle">
          {mode === "login"
            ? "Entre na sua conta para continuar."
            : mode === "recovery"
              ? "Enviaremos um link para seu e-mail cadastrado."
              : "Crie uma senha para seu primeiro acesso."}
        </p>
        <form className="auth-form" noValidate onSubmit={submit}>
          {mode !== "activate" ? (
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com"
                required
              />
            </label>
          ) : (
            <label>
              E-mail do convite
              <input
                type="email"
                value={inviteEmail}
                readOnly
                placeholder="Abra seu convite por e-mail"
                aria-describedby="invite-hint"
              />
              <span id="invite-hint" className="auth-hint">
                Use o link seguro recebido para ativar a conta.
              </span>
            </label>
          )}
          {mode !== "recovery" && (
            <>
              <label>
                {mode === "login" ? "Senha" : "Criar senha"}
                <PasswordInput
                  name="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder={
                    mode === "login"
                      ? "Digite sua senha"
                      : "Mínimo de 12 caracteres"
                  }
                  required
                />
              </label>
              {mode === "activate" && (
                <>
                  <label>
                    Confirmar senha
                    <PasswordInput
                      name="confirmation"
                      placeholder="Repita sua nova senha"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <p className="auth-hint">
                    Use 12+ caracteres, número e letra maiúscula.
                  </p>
                </>
              )}
            </>
          )}
          {mode === "login" && (
            <div className="auth-options">
              <label>
                <input type="checkbox" name="remember" />
                Manter conectado
              </label>
              <a href="/recuperar-senha">Esqueceu sua senha?</a>
            </div>
          )}
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="auth-feedback">
              {notice}
            </p>
          )}
          <button className="auth-submit" disabled={busy}>
            {busy
              ? "Aguarde…"
              : mode === "login"
                ? "Entrar"
                : mode === "recovery"
                  ? "Enviar link de recuperação"
                  : "Ativar minha conta"}
          </button>
        </form>
        <p className="auth-footer">
          <a href={mode === "login" ? "/primeiro-acesso" : "/login"}>
            {mode === "login"
              ? "Primeiro acesso?  Ativar conta"
              : mode === "recovery"
                ? "←  Voltar para o login"
                : "Já possui acesso?  Entrar"}
          </a>
        </p>
      </section>
      {!configured && (
        <p className="auth-unconfigured" role="status">
          Supabase não configurado.{" "}
          <a href="/demo/dashboard">Explorar demonstração</a>
        </p>
      )}
    </main>
  );
}
