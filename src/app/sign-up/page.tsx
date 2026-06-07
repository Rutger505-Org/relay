import { redirect } from "next/navigation";

/**
 * Sign-up now lives on the combined auth page. Keep this route as a redirect so
 * old links / bookmarks still work.
 */
export default function SignUpRedirect() {
  redirect("/sign-in");
}
