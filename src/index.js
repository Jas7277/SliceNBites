const SECURITY_TXT = [
  "# Slice N Bites — how to report a security issue",
  "Contact: mailto:jas7277git@gmail.com",
  "Expires: 2027-07-01T00:00:00.000Z",
  "Preferred-Languages: en",
  "Canonical: https://slicenbites.org/.well-known/security.txt",
  "",
].join("\n");

const LIMITS = { name: 100, email: 254, message: 5000 };
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; form-action 'self' https://slicenbites.org; frame-ancestors 'none'; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com https://api.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none';",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/.well-known/security.txt" || url.pathname === "/.wellknown/security.txt") {
      return text(SECURITY_TXT, 200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      });
    }

    if (url.pathname === "/api/feedback") {
      if (request.method !== "POST") {
        return text("Method not allowed.", 405, { Allow: "POST" });
      }
      return handleFeedback(request, env);
    }

    const response = await env.ASSETS.fetch(request);

    if (response.status === 404) {
      const notFound = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
      if (notFound.ok) {
        return withSecurityHeaders(notFound, { "Cache-Control": "public, max-age=300, must-revalidate" });
      }
    }

    return withSecurityHeaders(response, cacheHeadersFor(url.pathname));
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
    subject: `New contact message from ${safeName}`,
    text: `Name: ${safeName}\nEmail: ${safeEmail}\n\n${message}`,
    html:
      `<p><strong>Name:</strong> ${escapeHTML(safeName)}</p>` +
      `<p><strong>Email:</strong> ${escapeHTML(safeEmail)}</p>` +
      toParagraphs(message),
  };

  let result;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.EMAIL_API_TOKEN}`,
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
  return withSecurityHeaders(
    new Response(body, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders }
    })
  );
}

function withSecurityHeaders(response, extraHeaders = {}) {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...extraHeaders })) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function cacheHeadersFor(pathname) {
  const isStaticAsset = /\.(css|js|png|jpe?g|svg|ico|webp|gif|avif|woff2?|ttf|eot)$/i.test(pathname);
  return {
    "Cache-Control": isStaticAsset ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  };
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
    .map((block) => `<p>${escapeHTML(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}