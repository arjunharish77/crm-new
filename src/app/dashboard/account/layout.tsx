import { AccountNav } from "@/components/account/account-nav";

// My account (UI/UX plan decision 8): every signed-in user's own profile, preferences,
// notifications, sign-in and security, and activity. No admin guard: each page only reads and
// changes the signed-in user's own data, and the APIs behind it act only on the caller.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto min-w-0 max-w-[1200px]">
            <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-[200px_minmax(0,1fr)]">
                <AccountNav />
                <div className="min-w-0">{children}</div>
            </div>
        </div>
    );
}
