import { getSupabase, isSupabaseConfigured } from "./supabase-client.js";
import { qs, setLoading } from "./ui.js";
const messages = { "Invalid login credentials": "E-mail ou senha incorretos.", "Email not confirmed": "Confirme seu e-mail antes de entrar.", "User already registered": "Já existe uma conta com este e-mail.", "Password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres." };
const message = (text, type = "error") => { const box = qs("#auth-message"); box.textContent = text; box.className = `auth-message show ${type}`; };
const supabase = getSupabase();
if (!isSupabaseConfigured()) qs("#config-note")?.classList.remove("sr-only");
qs("[data-password-toggle]")?.addEventListener("click", event => { const input = qs("#password"); const visible = input.type === "text"; input.type = visible ? "password" : "text"; event.currentTarget.textContent = visible ? "Mostrar" : "Ocultar"; });
const form = qs("#auth-form");
form?.addEventListener("submit", async event => {
  event.preventDefault(); if (form.dataset.submitting === "true") return;
  if (!supabase) { message("Configure a URL e a chave pública do Supabase em js/config.js. Enquanto isso, você pode acessar o modo local pela página de login."); return; }
  form.dataset.submitting = "true"; const button = qs("button[type=submit]", form); setLoading(button, true);
  try {
    const action = form.dataset.action, email = qs("#email")?.value.trim(), password = qs("#password")?.value, name = qs("#name")?.value.trim(); let result;
    if (action === "login") result = await supabase.auth.signInWithPassword({ email, password });
    if (action === "signup") result = await supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: `${location.origin}/app/` } });
    if (action === "recover") result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login.html?recovery=1` });
    if (result.error) throw result.error;
    if (action === "login") location.replace(new URLSearchParams(location.search).get("next") || "/app/");
    else message(action === "signup" ? "Cadastro realizado. Verifique seu e-mail para confirmar a conta." : "Enviamos as instruções de recuperação para seu e-mail.", "success");
  } catch (error) { message(messages[error.message] || "Não foi possível concluir. Verifique os dados e tente novamente."); }
  finally { form.dataset.submitting = "false"; setLoading(button, false); }
});
qs("#local-access")?.addEventListener("click", () => location.assign("/app/"));
