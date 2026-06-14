import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div dir="rtl" className="min-h-screen w-full flex items-center justify-center p-4">
      <Card className="glass-card w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Compass className="h-8 w-8 text-primary" />
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2">الصفحة غير موجودة</h1>

          <p className="text-sm text-muted-foreground mb-6">
            عذرًا، الصفحة التي تبحث عنها غير متاحة أو تم نقلها.
          </p>

          <Link href="/">
            <Button className="w-full">العودة للرئيسية</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
