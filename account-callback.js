(() => {
  const $ = (id) => document.getElementById(id),
    hash = new URLSearchParams(location.hash.slice(1)),
    params = new URLSearchParams(location.search),
    accessToken = hash.get("access_token"),
    refreshToken = hash.get("refresh_token"),
    recovery =
      params.get("flow") === "recovery" || hash.get("type") === "recovery";
  history.replaceState(null, "", location.pathname);
  const title = (text) => {
    $("callbackTitle").textContent = text;
    document.title = text + " | CubicShip";
  };
  async function request(body) {
    const response = await fetch("/api/customer-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data.ok)
      throw Error(data.error || "This link could not be verified.");
    return data;
  }
  async function verify() {
    if (!accessToken || hash.has("error") || params.has("error")) {
      title("Link needs attention.");
      $("callbackMessage").textContent =
        "Open the complete link from your email or request a new confirmation or password-reset email.";
      return;
    }
    try {
      await request({ action: "verify", accessToken });
      if (recovery && refreshToken) {
        title("Choose a new password.");
        $("callbackMessage").textContent =
          "Your link is verified. Enter your new password below.";
        $("passwordForm").hidden = false;
      } else {
        title("Email confirmed.");
        $("callbackMessage").textContent =
          "Your email is verified. You can now sign in.";
      }
    } catch (error) {
      title("Link needs attention.");
      $("callbackMessage").textContent = error.message;
    }
  }
  $("passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("newPassword").value !== $("confirmPassword").value) {
      $("callbackMessage").textContent = "The passwords do not match.";
      return;
    }
    $("passwordSend").disabled = true;
    try {
      const data = await request({
        action: "update-password",
        accessToken,
        refreshToken,
        password: $("newPassword").value,
      });
      $("passwordForm").reset();
      $("passwordForm").hidden = true;
      title("Password updated.");
      $("callbackMessage").textContent = data.message;
    } catch (error) {
      $("callbackMessage").textContent = error.message;
    } finally {
      $("passwordSend").disabled = false;
    }
  });
  verify();
})();
