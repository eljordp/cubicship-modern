(() => {
  const form = document.getElementById("recoveryForm"),
    message = document.getElementById("recoveryMessage"),
    button = document.getElementById("recoverySend");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    button.disabled = true;
    message.textContent = "Requesting email…";
    try {
      const response = await fetch("/api/customer-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: document.getElementById("recoveryAction").value,
            email: document.getElementById("recoveryEmail").value,
          }),
        }),
        data = await response.json();
      message.textContent =
        data.message || data.error || "Please try again later.";
    } catch {
      message.textContent =
        "Could not reach account support. Please try again.";
    } finally {
      button.disabled = false;
    }
  });
})();
