export function CandidateFooter() {
    return (
        <footer className="border-t bg-gray-50">
            <div className="container py-8 md:py-12">
                <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                    <p className="text-sm text-gray-500">
                        © 2026 Careera Inc. All rights reserved.
                    </p>
                    <div className="flex gap-4">
                        <a href="#" className="text-sm text-gray-500 hover:text-blue-600">
                            Privacy Policy
                        </a>
                        <a href="#" className="text-sm text-gray-500 hover:text-blue-600">
                            Terms of Service
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
