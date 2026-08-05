import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <Suspense fallback={<div className="text-sm text-slate-500">Loading...</div>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
