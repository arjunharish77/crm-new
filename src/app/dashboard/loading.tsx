import { PageSkeleton } from "@/components/common/skeletons";

// Shown while a dashboard route's code loads (UI/UX plan G1), inside the app shell.
export default function DashboardLoading() {
    return (
        <div aria-busy="true" aria-label="Loading page">
            <PageSkeleton cardCount={2} />
        </div>
    );
}
