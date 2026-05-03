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
              Geri qayıt
            </Button>
          </Link>
          <div className="text-sm text-muted-foreground">
            Son yenilənmə: {lastUpdated}
          </div>
        </div>

        <Card className="border-none shadow-elevated">
          <CardHeader className="border-b border-border/50 px-8 py-10 text-center">
            <CardTitle className="text-3xl font-bold tracking-tight">İstifadə Şərtləri</CardTitle>
            <p className="text-muted-foreground mt-2">
              Xidmətimizdən istifadə etməzdən əvvəl lütfən bu şərtləri diqqətlə oxuyun.
            </p>
          </CardHeader>
          <CardContent className="p-8 prose prose-slate dark:prose-invert max-w-none">
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">1. Şərtlərin Qəbulu</h2>
              <p>
                Meet Recorder Bot-a ("Xidmət") daxil olmaqla və ondan istifadə etməklə siz bu İstifadə Şərtləri və bütün müvafiq qanun və qaydalarla bağlı olmağa razılaşırsınız. Bu şərtlərdən hər hansı biri ilə razı deyilsinizsə, bu saytdan istifadə etməyiniz və ya ona daxil olmağınız qadağandır.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">2. Xidmətin Təsviri</h2>
              <p>
                Meet Recorder Bot avtomatlaşdırılmış görüş yazma, transkripsiya və xülasə xatırlatma xidmətləri təqdim edir. Audio/video yazmaq və qeydlər yaratmaq üçün botumuzu virtual görüşlərə (məsələn, Google Meet, Zoom) dəvət edə bilərsiniz.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">3. İstifadəçi Öhdəlikləri</h2>
              <p>Xidmətdən istifadə etməklə siz aşağıdakıları bəyan edir və zəmanət verirsiniz:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2 text-muted-foreground">
                <li>Botu dəvət etdiyiniz görüşləri yazmaq üçün hüquqi səlahiyyətiniz var.</li>
                <li>Yazma razılığı ilə bağlı bütün yerli, dövlət və beynəlxalq qanunlara əməl edəcəksiniz.</li>
                <li>Bütün görüş iştirakçılarına görüşün yazıldığı barədə məlumat verəcəksiniz.</li>
                <li>Hesab məlumatlarınızın məxfiliyini qorumaq üçün məsuliyyət daşıyırsınız.</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">4. Əqli Mülkiyyət</h2>
              <p>
                Xidmət və onun orijinal məzmunu, xüsusiyyətləri və funksionallığı Meet Recorder Bot-un və onun lisenziya verənlərinin müstəsna mülkiyyəti olaraq qalır. Yazılmış məzmununuz və transkriptləriniz sizə məxsusdur; lakin Xidməti təmin etmək üçün bu məlumatları emal etmək üçün bizə məhdud lisenziya verirsiniz.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">5. Məsuliyyətin Məhdudlaşdırılması</h2>
              <p>
                Heç bir halda Meet Recorder Bot, nə də onun direktorları, işçiləri və ya tərəfdaşları Xidmətə daxil olmanız, ondan istifadəniz və ya istifadə edə bilməməniz nəticəsində yaranan hər hansı dolayı, təsadüfi, xüsusi, nəticə etibarilə və ya cəza xarakterli zərərlərə, o cümlədən məhdudiyyət qoyulmadan mənfəət, məlumat, istifadə və ya digər qeyri-maddi itkilərə görə məsuliyyət daşımır.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">6. Xitam</h2>
              <p>
                Biz heç bir əvvəlcədən xəbərdarlıq etmədən və ya məsuliyyət daşımadan, hər hansı bir səbəbdən, o cümlədən Şərtlərin pozulması daxil olmaqla, lakin bununla məhdudlaşmayaraq, hesabınızı dərhal ləğv edə və ya dayandıra və Xidmətə girişi qadağan edə bilərik.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">7. Tənzimləyici Qanun</h2>
              <p>
                Bu Şərtlər qanunvericilik müddəaları ilə ziddiyyət təşkil etmədən, şirkətin qeydiyyata alındığı yurisdiksiyanın qanunlarına uyğun olaraq tənzimlənəcək və şərh ediləcəkdir.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
