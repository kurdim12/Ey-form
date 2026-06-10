export type RegistrationStatus = "new" | "checked_in";

export interface Registration {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  photo_url: string | null;
  status: RegistrationStatus;
  created_at: string;
}

/** Shape of a new row inserted from the public form (DB fills the rest). */
export type RegistrationInsert = Pick<
  Registration,
  "first_name" | "last_name" | "email" | "phone" | "photo_url"
>;
