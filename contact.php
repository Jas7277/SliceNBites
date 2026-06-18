<?php
$recipient = 'slicenbites@hotmail.com';
$errors = [];
$success = '';
$name = '';
$email = '';
$message = '';

function escape($value) {
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim($_POST['name'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $message = trim($_POST['message'] ?? '');

    if ($name === '') {
        $errors[] = 'Name is required.';
    }

    if ($email === '') {
        $errors[] = 'Email is required.';
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Email is invalid.';
    }

    if ($message === '') {
        $errors[] = 'Message is required.';
    }

    if (empty($errors)) {
        $subject = 'Website feedback from ' . $name;
        $body = "Name: $name\nEmail: $email\n\n$message";
        $headers = "From: $name <$email>\r\nReply-To: $email\r\n";

        if (mail($recipient, $subject, $body, $headers)) {
            $success = 'Your message was sent successfully.';
            $name = '';
            $email = '';
            $message = '';
        } else {
            $errors[] = 'Failed to send email. Please try again later.';
        }
    }
}
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Slice N Bites</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>

<header>
  <nav>
    <div class="logo"><img src="images/logo.png" alt="Slice N Bites"></div>
    <div>
      <a href="index.html">Home</a>
      <a href="menu.html">Menu</a>
      <a href="about.html">About</a>
      <a href="contact.php">Contact</a>
    </div>
  </nav>
</header>

<div class="container">
  <h1>Location & Contact</h1>

  <h2>Location</h2>
  <p><a href="https://maps.app.goo.gl/rdAnHm1tiYbVeD8KA">1 Youden Place, Brigus, NL A0A 1K0, Canada</a></p>

  <h2>Hours</h2>
  <p>24/7</p>

  <h2>Contact</h2>
  <p>Phone: +1 (709) 589-6192<br>Email: slicenbites@hotmail.com</p>

  <h2>Send me feedback!</h2>

  <?php if (!empty($errors)): ?>
    <div class="form-errors">
      <p>Please fix the following:</p>
      <ul>
        <?php foreach ($errors as $error): ?>
          <li><?php echo escape($error); ?></li>
        <?php endforeach; ?>
      </ul>
    </div>
  <?php endif; ?>

  <?php if ($success): ?>
    <div class="form-success">
      <p><?php echo escape($success); ?></p>
    </div>
  <?php endif; ?>

  <form method="post" action="contact.php">
    <input type="text" name="name" value="<?php echo escape($name); ?>" placeholder="Your Name" required><br><br>
    <input type="email" name="email" value="<?php echo escape($email); ?>" placeholder="Your Email" required><br><br>
    <textarea name="message" placeholder="Your Message" rows="5" required><?php echo escape($message); ?></textarea><br><br>
    <button class="button" type="submit">Send</button>
  </form>
</div>

<footer>
  © 2026 Slice N Bites — All Rights Reserved
</footer>

</body>
</html>
