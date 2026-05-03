import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
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
            <CardTitle className="text-3xl font-bold tracking-tight">Privacy Policy</CardTitle>
            <p className="text-muted-foreground mt-2">
              How we handle your meeting data and protect your privacy.
            </p>
          </CardHeader>
          <CardContent className="p-8 prose prose-slate dark:prose-invert max-w-none">
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
              <p>
                Welcome to Meet Recorder Bot ("we", "our", or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, and safeguard your data when you use our meeting recording and transcription services.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">2. Information We Collect</h2>
              <p>When you use our service, we may collect the following types of information:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2 text-muted-foreground">
                <li><strong>Audio and Video Content:</strong> We record the audio and video streams of the meetings you invite our bot to.</li>
                <li><strong>Meeting Metadata:</strong> Information about the meeting, including title, duration, participant names, and timestamps.</li>
                <li><strong>Account Information:</strong> If you create an account, we collect your email address and basic profile information.</li>
                <li><strong>Transcription Data:</strong> Text generated from the audio recordings for the purpose of creating notes and summaries.</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">3. How We Use Your Information</h2>
              <p>We use the collected information for the following purposes:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2 text-muted-foreground">
                <li>To provide, operate, and maintain our service.</li>
                <li>To process audio and video recordings to generate transcripts and meeting summaries.</li>
                <li>To improve our AI models and service performance (using anonymized data).</li>
                <li>To communicate with you regarding your account and service updates.</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">4. Data Storage and Security</h2>
              <p>
                Your data is stored securely using industry-standard encryption methods. We implement a variety of security measures to maintain the safety of your personal information. Meeting recordings are stored in secure cloud environments and are only accessible by authorized users.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">5. Data Sharing</h2>
              <p>
                We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties. This does not include trusted third parties who assist us in operating our website, conducting our business, or servicing you, so long as those parties agree to keep this information confidential.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">6. Your Rights</h2>
              <p>
                Depending on your location, you may have the right to access, correct, or delete your personal data. You can request the deletion of your account and associated meeting data at any time through the dashboard settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">7. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy, please contact our support team.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
