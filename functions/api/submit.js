const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function createJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      ...CORS_HEADERS,
    },
  });
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

async function parseRequestBody(request) {
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('application/json')) {
    return request.json();
  }

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }

  return null;
}

async function sendEmailWithSendGrid(env, name, email, message) {
  const apiKey = env.SENDGRID_API_KEY;
  const recipient = env.FEEDBACK_RECIPIENT_EMAIL || 'slicenbites@hotmail.com';
  const sender = env.SENDGRID_SENDER_EMAIL || 'no-reply@yourdomain.com';

  if (!apiKey) {
    throw new Error('SendGrid API key is not configured.');
  }

  const payload = {
    personalizations: [
      {
        to: [{ email: recipient }],
        subject: `Website feedback from ${name}`,
      },
    ],
    from: {
      email: sender,
      name: 'Slice N Bites Website',
    },
    reply_to: {
      email,
      name,
    },
    content: [
      {
        type: 'text/plain',
        value: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      },
    ],
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`SendGrid request failed (${response.status}): ${details}`);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return createJsonResponse({ error: 'Method not allowed' }, 405);
    }

    const body = await parseRequestBody(request);
    if (!body) {
      return createJsonResponse({ error: 'Unsupported content type' }, 415);
    }

    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    const message = (body.message || '').trim();

    const errors = [];
    if (!name) errors.push('Name is required.');
    if (!email) errors.push('Email is required.');
    if (email && !validateEmail(email)) errors.push('Email is invalid.');
    if (!message) errors.push('Message is required.');

    if (errors.length) {
      return createJsonResponse({ errors }, 400);
    }

    try {
      await sendEmailWithSendGrid(env, name, email, message);
      return createJsonResponse({ success: true, message: 'Feedback submitted successfully.' });
    } catch (error) {
      return createJsonResponse({ error: error.message || 'Failed to send feedback.' }, 502);
    }
  },
};
