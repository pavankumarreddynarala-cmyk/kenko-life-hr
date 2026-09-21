import { redirect } from "next/navigation";

// The site root always leads to the Management sign-in. (A signed-in manager is passed on
// from there to the dashboard; employees use /employee/login.)
export default function Home() {
  redirect("/login");
}
