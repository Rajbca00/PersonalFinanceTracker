import Link from "next/link";
import { EmptyState } from "@/components/Ui";

export default function NotFound() {
  return (
    <div className="card mt-8 max-w-lg mx-auto">
      <EmptyState
        title="Page not found"
        message="That account, card or page no longer exists."
        action={
          <Link href="/" className="btn btn-primary no-underline">
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
