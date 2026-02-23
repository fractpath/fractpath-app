import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/login?returnTo=%2Fdeal%2Fnew");
}
