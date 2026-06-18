export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/feedback" && request.method === "POST") {
      return handleFeedback(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleFeedback(request, env) {
  const form = await request.formData();
  const name = (form.get("name") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
  const message = (form.get("message") || "").toString().trim();

  if (!name || !email || !message) {
    return new Response("All fields are required.", { status: 400 });
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.EMAIL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: "scottjas595@gmail.com",
        from: "feedback@slicenbites.org",
        subject: `New contact message from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
        html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p>${message}</p>`,
      }),
    }
  );

  const detail = await res.text(); // the API's actual response
  if (!res.ok) {
    console.error("Email API error:", res.status, detail);
    // TEMPORARY — remove once it works; don't leak API errors to visitors long-term
    return new Response(`Email API error ${res.status}: ${detail}`, { status: 502 });
  }

  return new Response("Thanks! Your message has been sent.", { status: 200 });
}