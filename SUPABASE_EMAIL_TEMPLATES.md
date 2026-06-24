# Cubic Ship Supabase Email Templates

Supabase hosted projects manage auth emails in the Dashboard:

`Authentication -> Email Templates`

Paste these subjects and HTML files into the matching template screens.

The app also sets signup confirmation links to:

```text
https://cubicship.com/auth/callback.html?next=%2Fprofile.html
```

That mirrors the Travelyt pattern: Supabase confirms the email, returns the customer to the branded site, then sends them to the profile login.

## Confirm Signup

Subject:

```text
Confirm your Cubic Ship account
```

HTML:

`supabase/email-templates/confirm-signup.html`

## Reset Password

Subject:

```text
Reset your Cubic Ship password
```

HTML:

`supabase/email-templates/reset-password.html`

## Magic Link

Subject:

```text
Sign in to your Cubic Ship profile
```

HTML:

`supabase/email-templates/magic-link.html`

## Change Email Address

Subject:

```text
Confirm your new Cubic Ship email
```

HTML:

`supabase/email-templates/change-email.html`

## Production Sender

For real customer delivery, configure custom SMTP in Supabase:

`Project Settings -> Authentication -> SMTP Settings`

Recommended sender:

```text
Cubic Ship <info@cubicship.com>
```

The default Supabase sender is useful for testing, but custom SMTP is better for real customer emails from the Cubic Ship domain.
