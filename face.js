const note = document.querySelector("#face-note");
const mark = document.querySelector("#face-mark");
document.querySelector("#face-open").addEventListener("click", async () => {
  mark.classList.add("scan");
  note.hidden = true;
  try {
    await requestFace();
    document.querySelector("#face").remove();
    document.querySelector("#app").hidden = false;
    await import("/budget.js");
  } catch (error) {
    mark.classList.remove("scan");
    if (error && error.name !== "NotAllowedError") {
      note.textContent = "Face ID לא זמין כאן";
      note.hidden = false;
    }
  }
});

async function requestFace() {
  if (!window.PublicKeyCredential) throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const saved = localStorage.getItem("budget-passkey");
  if (!saved) {
    const created = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "התקציב" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "me", displayName: "התקציב" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
      },
    });
    if (!created) throw Object.assign(new Error("cancel"), { name: "NotAllowedError" });
    const bytes = new Uint8Array(created.rawId);
    localStorage.setItem("budget-passkey", btoa(String.fromCharCode(...bytes)));
    return;
  }
  const rawId = Uint8Array.from(atob(saved), (char) => char.charCodeAt(0));
  const result = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: "public-key", id: rawId }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  if (!result) throw Object.assign(new Error("cancel"), { name: "NotAllowedError" });
}
