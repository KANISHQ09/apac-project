import React, { forwardRef } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { ROUTES } from "@/shared/config/routes";
import {
  MapPin,
  Phone,
  Mail,
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  ExternalLink,
  Building2,
} from "lucide-react";

const socialLinks = [
  { icon: <Facebook className="w-4 h-4" />, href: "#", label: "Facebook" },
  { icon: <Twitter className="w-4 h-4" />, href: "#", label: "Twitter" },
  { icon: <Instagram className="w-4 h-4" />, href: "#", label: "Instagram" },
  { icon: <Youtube className="w-4 h-4" />, href: "#", label: "YouTube" },
];

const departments = [
  { labelKey: "footer.dept.mohua",     href: "https://mohua.gov.in" },
  { labelKey: "footer.dept.jalshakti", href: "https://jalshakti-dowr.gov.in" },
  { labelKey: "footer.dept.power",     href: "https://powermin.gov.in" },
  { labelKey: "footer.dept.roads",     href: "https://morth.nic.in" },
  { labelKey: "footer.dept.meity",     href: "https://www.meity.gov.in" },
  { labelKey: "footer.dept.panchayat", href: "https://panchayat.gov.in" },
];

export const Footer = forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  (props, ref) => {
    const { t, language } = useLanguage();

    const quickLinks = [
      { labelKey: "nav.report",    href: ROUTES.REPORT_ISSUE },
      { labelKey: "nav.dashboard", href: ROUTES.DASHBOARD },
      { labelKey: "nav.schemes",   href: ROUTES.SCHEMES },
      { labelKey: "nav.analyzer",  href: ROUTES.FORM_ANALYZER },
      { labelKey: "nav.documents", href: ROUTES.DOCUMENTS },
    ];

    const resources = [
      { labelKey: "footer.helpCenter",    href: "#",                              external: false },
      { labelKey: "footer.privacyPolicy", href: "#",                              external: false },
      { labelKey: "footer.terms",         href: "#",                              external: false },
      { label: language === "en" ? "Accessibility" : "सुलभता",  href: "#",                              external: false },
      { label: language === "en" ? "RTI Portal"    : "RTI पोर्टल", href: "https://rtionline.gov.in", external: true  },
    ];

    return (
      <footer ref={ref} className="bg-foreground text-background" {...props}>
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-primary via-secondary to-primary opacity-60" />

        <div className="container mx-auto px-6">

          {/* ── 5-column grid ── */}
          <div className="py-16 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-12 gap-y-10">

            {/* 1 — Brand */}
            <div>
              <Link to={ROUTES.HOME} className="flex items-center gap-2.5 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-bold text-lg">स</span>
                </div>
                <div>
                  <p className="font-bold text-lg text-background leading-tight">Samadhan</p>
                  <p className="text-[10px] text-background/50 tracking-wide">समाधान</p>
                </div>
              </Link>
              <p className="text-background/70 text-sm mb-4 leading-relaxed">
                {t("footer.tagline")}
              </p>
              <p className="text-background/40 text-xs mb-6 leading-relaxed">
                {language === "en"
                  ? "In partnership with Urban Local Bodies & Central Ministries."
                  : "शहरी निकायों एवं केंद्रीय मंत्रालयों के साथ।"}
              </p>
              <div className="flex gap-2.5">
                {socialLinks.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="w-9 h-9 rounded-lg bg-background/10 hover:bg-primary text-background flex items-center justify-center transition-colors"
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>

            {/* 2 — Quick Links */}
            <div>
              <h4 className="font-semibold text-background text-sm mb-5 pb-2 border-b border-background/10">
                {t("footer.quickLinks")}
              </h4>
              <ul className="space-y-3">
                {quickLinks.map((link) => (
                  <li key={link.labelKey}>
                    <Link
                      to={link.href}
                      className="text-background/65 hover:text-background text-sm transition-colors hover:translate-x-0.5 inline-block"
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* 3 — Resources */}
            <div>
              <h4 className="font-semibold text-background text-sm mb-5 pb-2 border-b border-background/10">
                {t("footer.resources")}
              </h4>
              <ul className="space-y-3">
                {resources.map((link, i) => (
                  <li key={i}>
                    <a
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="text-background/65 hover:text-background text-sm transition-colors inline-flex items-center gap-1 hover:translate-x-0.5"
                    >
                      {"labelKey" in link ? t(link.labelKey) : link.label}
                      {link.external && <ExternalLink className="w-2.5 h-2.5" />}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* 4 — Gov. Departments */}
            <div>
              <h4 className="font-semibold text-background text-sm mb-5 pb-2 border-b border-background/10 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                {t("footer.departments")}
              </h4>
              <ul className="space-y-3">
                {departments.map((dept) => (
                  <li key={dept.labelKey}>
                    <a
                      href={dept.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-background/65 hover:text-background text-sm transition-colors inline-flex items-center gap-1 group hover:translate-x-0.5"
                    >
                      {t(dept.labelKey)}
                      <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 transition-opacity" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* 5 — Contact */}
            <div>
              <h4 className="font-semibold text-background text-sm mb-5 pb-2 border-b border-background/10">
                {t("footer.contactUs")}
              </h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-background/65 text-sm leading-relaxed">
                    {language === "en" ? (
                      <>Min. of Housing &amp; Urban Affairs,<br />New Delhi – 110 003</>
                    ) : (
                      <>आवास एवं नगर कार्य मंत्रालय,<br />नई दिल्ली – 110 003</>
                    )}
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-background/65 text-sm">
                    1800-111-555{" "}
                    <span className="text-background/40 text-xs">
                      ({language === "en" ? "Toll Free" : "निःशुल्क"})
                    </span>
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-background/65 text-sm break-all">
                    support@samadhan.gov.in
                  </span>
                </li>
              </ul>
            </div>

          </div>

          {/* ── Bottom bar ── */}
          <div className="py-6 border-t border-background/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-background/40 text-sm text-center sm:text-left">
              © {new Date().getFullYear()} Samadhan. {t("footer.rights")}
            </p>
            <span className="text-background/40 text-sm">
              {language === "en"
                ? "Made with ❤️ for every citizen of India"
                : "भारत के हर नागरिक के लिए ❤️ से बनाया गया"}
            </span>
          </div>

        </div>
      </footer>
    );
  }
);

Footer.displayName = "Footer";
