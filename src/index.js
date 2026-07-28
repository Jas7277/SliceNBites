const SECURITY_TXT = [
  "# Slice N Bites — how to report a security issue",
  "Contact: mailto:jas7277git@gmail.com",
  "Expires: 2027-07-01T00:00:00.000Z",
  "Preferred-Languages: en",
  "Canonical: https://slicenbites.org/.well-known/security.txt",
  "",
].join("\n");

const LIMITS = { name: 100, email: 254, message: 5000 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/.wellknown/security.txt") {
      return new Response(SECURITY_TXT, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=86400"
        },
      });
    }

    if (url.pathname === "/api/feedback") {
      if (request.method !== "POST") {
        return text("Method not allowed.", 405, { Allow: "POST" });
      }
      return handleFeedback(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleFeedback(request, env) {
  let form;

  try {
    form = await request.formData();
  } catch {
    return text("Couldn't read that submission. Please try again", 400);
  }

  const name = field(form, "name", LIMITS.name);
  const email = field(form, "email", LIMITS.email);
  const message = field(form, "message", LIMITS.message);

  if (!name || !email || !message) {
    return new Response("All fields are required.", 400);
  }

  if (!isPlausibleEmail(email)) {
    return text("That email address doesn't look right.", 400);
  }

  // Verify the visitor passed the Turnstile challenge
  const token = (form.get("cf-turnstile-response") || "").toString();

  if (!token) {
    return text("Please complete the verification check", 400);
  }

  let verified = false;
  
  try {
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", 
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: request.headers.get("CF-Connecting-IP") || ""
        })
      }
    );
      const outcome = await verifyRes.json();
      verified = outcome?.success === true;
  } catch (err) {
    console.error("Turnstile verification failed: ", err);
    return text("Verification is unavailable right now. Please try again.", 500);
  }

  if (!verified) {
    return text("Couldn't verify you're human. Please try again.", 400);
  }

  const safeName = oneLine(name);
  const safeEmail = oneLine(email);

  const payload = {
    to: "slicenbites@hotmail.com",
    from: "feedback@slicenbites.org",
    reply_to: safeEmail,
    subject: 'New contact message from ${safeName}',
    text: 'Name: ${safeName}\nEmail: ${safeEmail}\n\n${message}',
    html:
      '<p><strong>Name:</strong> ${escapeHTML(safeName)}</p>' +
      '<p><strong>Email:</strong> ${escapeHTML(safeEmail)}</p>'+
      toParagraphs(message)
  };

  let result;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: 'Bearer ${env.EMAIL_API_TOKEN}',
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    result = await res.json().catch(() => null);

    if (!res.ok || result?.success !== true) {
      console.error("Email send rejected:", res.status, JSON.stringify(result?.errors ?? result));
      return text("Sorry, something went wrong sending your message.", 502);
    }
  } catch (err) {
    console.error("Email send threw:", err);
    return text("Sorry, something went wrong sending your message.", 502);
  }

  const delivered = result?.result?.delivered?.length ?? 0;
  const queued = result?.result?.queued?.length ?? 0;
  const bounced = result?.result?.permanent_bounces?.length ?? 0;

  if (delivered === 0 && queued === 0){
    console.error("Email accepted but not delivered:", JSON.stringify(result?.result));
    return text(
      bounced > 0 ? "That message couldn't be delivered. Please message me directly on Facebook instead." : "Sorry, something went wrong sending your message.",
      502
    );
  }

  return text("Thanks! Your message has been sent.", 200);
}

function text(body, status, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders }
  });
}

function field(form, key, max) {
  return (form.get(key) || "").toString().trim().slice(0, max);
}

function isPlausibleEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function oneLine(value) {
  return value.replace(/[\r\n]+/g, "").trim();
}

function escapeHTML(value) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );
}

function toParagraphs(value) {
  return value
    .split(/\n{2,}/)
    .map((block) => '<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>')
    .join("");
}