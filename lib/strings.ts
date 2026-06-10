/**
 * Centralized UI strings.
 *
 * Everything user-facing lives here so the whole app can be re-skinned or
 * translated (Arabic / RTL is a likely future ask) by editing one file.
 */

export const EVENT_NAME = "Gala Dinner 2026";

export const strings = {
  event: {
    name: EVENT_NAME,
    location: "Amman",
  },

  form: {
    heading: EVENT_NAME,
    subheading: "You are cordially invited",
    intro: "Please complete your registration below.",
    photoLabel: "Add your photo",
    photoHint: "Tap to add a photo",
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    phone: "Phone",
    phonePlaceholder: "+962 7X XXX XXXX",
    submit: "Register",
    submitting: "Registering…",

    // Confirmation (use {name} as a placeholder for the guest's first name)
    successTitle: "You're on the guest list",
    successBody: "We look forward to welcoming you, {name}.",

    // Validation / errors
    errorRequiredPhoto: "Please add a photo to continue.",
    errorRequiredFields: "Please fill in all fields.",
    errorEmail: "Please enter a valid email address.",
    errorPhotoTooLarge: "That image is larger than 10MB. Please choose a smaller photo.",
    errorPhotoNotImage: "Please choose an image file.",
    errorUpload: "We couldn't upload your photo. Please check your connection and try again.",
    errorSubmit: "Something went wrong while registering. Your details are saved — please try again.",
  },

  admin: {
    title: EVENT_NAME,
    subtitle: "Registration desk",
    total: "Total",
    today: "Today",
    live: "Live",
    offline: "Reconnecting…",
    signOut: "Sign out",
    searchPlaceholder: "Search by name, email or phone",
    exportCsv: "Export CSV",
    empty: "No registrations yet.",
    noMatches: "No guests match your search.",
    statusNew: "New",
    statusCheckedIn: "Checked in",
    colGuest: "Guest",
    colContact: "Contact",
    colRegistered: "Registered",
    colStatus: "Status",
  },

  login: {
    heading: EVENT_NAME,
    subheading: "Registration desk — staff sign in",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    error: "Invalid email or password.",
    unexpected: "Something went wrong. Please try again.",
  },
} as const;
