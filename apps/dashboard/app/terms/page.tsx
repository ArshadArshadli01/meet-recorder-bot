import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-sm text-muted-foreground">
            Last updated: {lastUpdated}
          </div>
        </div>

        <Card className="border-none shadow-elevated">
          <CardHeader className="border-b border-border/50 px-8 py-10 text-center">
            <CardTitle className="text-3xl font-bold tracking-tight">Terms of Service</CardTitle>
            <p className="text-muted-foreground mt-2">
              Please read these terms carefully before using our service.
            </p>
          </CardHeader>
          <CardContent className="p-8 prose prose-slate dark:prose-invert max-w-none">
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p>
                By accessing and using Meet Recorder Bot ("the Service"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
              <p>
                Meet Recorder Bot provides automated meeting recording, transcription, and summarization services. You may invite our bot to virtual meetings (e.g., Google Meet, Zoom) to record audio/video and generate notes.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">3. User Obligations</h2>
              <p>By using the Service, you represent and warrant that:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2 text-muted-foreground">
                <li>You have the legal authority to record the meetings you invite the bot to.</li>
                <li>You will comply with all local, state, and international laws regarding recording consent.</li>
                <li>You will notify all meeting participants that the meeting is being recorded.</li>
                <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">4. Intellectual Property</h2>
              <p>
                The Service and its original content, features, and functionality are and will remain the exclusive property of Meet Recorder Bot and its licensors. Your recorded content and transcripts belong to you; however, you grant us a limited license to process this data to provide the Service.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">5. Limitation of Liability</h2>
              <p>
                In no event shall Meet Recorder Bot, nor its directors, employees, or partners, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">6. Termination</h2>
              <p>
                We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever and without limitation, including but not limited to a breach of the Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">7. Governing Law</h2>
              <p>
                These Terms shall be governed and construed in accordance with the laws of the jurisdiction in which the company is registered, without regard to its conflict of law provisions.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
