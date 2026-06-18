import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Sreeva AI workspace.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/login",
  },
};
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
