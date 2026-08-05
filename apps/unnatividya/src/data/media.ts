export const universityMedia: Record<
  string,
  { src: string; alt: string; logo: string; moments: Array<{ src: string; alt: string }>; partnerLogos: string[] }
> = {
  muj: {
    src: "/universities/manipal-university-jaipur-campus.webp",
    alt: "Manipal University Jaipur campus",
    logo: "/universities/manipal-university-jaipur-logo.svg",
    moments: [
      { src: "/universities/manipal-university-jaipur-moment-1.webp", alt: "Manipal University Jaipur campus moment 1" },
      { src: "/universities/manipal-university-jaipur-moment-2.webp", alt: "Manipal University Jaipur campus moment 2" },
      { src: "/universities/manipal-university-jaipur-moment-3.webp", alt: "Manipal University Jaipur campus moment 3" },
    ],
    partnerLogos: Array.from({ length: 6 }, (_, i) => `/universities/manipal-university-jaipur-partner-logo-${i + 1}.svg`),
  },
  smu: {
    src: "/universities/sikkim-manipal-university-campus.webp",
    alt: "Sikkim Manipal University campus",
    logo: "/universities/sikkim-manipal-university-logo.svg",
    moments: [
      { src: "/universities/sikkim-manipal-university-moment-1.webp", alt: "Sikkim Manipal University campus moment 1" },
      { src: "/universities/sikkim-manipal-university-moment-2.webp", alt: "Sikkim Manipal University campus moment 2" },
      { src: "/universities/sikkim-manipal-university-moment-3.webp", alt: "Sikkim Manipal University campus moment 3" },
    ],
    partnerLogos: Array.from({ length: 6 }, (_, i) => `/universities/sikkim-manipal-university-partner-logo-${i + 1}.svg`),
  },
  amity: {
    src: "/universities/amity-online-campus.webp",
    alt: "Amity University Noida campus",
    logo: "/universities/amity-online-logo.svg",
    moments: [
      { src: "/universities/amity-online-moment-1.webp", alt: "Amity University Online campus moment 1" },
      { src: "/universities/amity-online-moment-2.webp", alt: "Amity University Online campus moment 2" },
      { src: "/universities/amity-online-moment-3.webp", alt: "Amity University Online campus moment 3" },
    ],
    partnerLogos: Array.from({ length: 6 }, (_, i) => `/universities/amity-online-partner-logo-${i + 1}.svg`),
  },
};

export function certificateImagePath(courseId: string) {
  return `/certificates/${courseId}-certificate-sample.webp`;
}

export const learningMedia = {
  src: "/hero/student-online-degree.webp",
  alt: "Online learning",
};

export const recommenderPreviewMedia = {
  src: "/hero/recommender-preview.webp",
  alt: "AI course recommender preview",
};

export const counselorGuidanceMedia = {
  src: "/hero/counselor-guidance.webp",
  alt: "Counsellor guiding a learner",
};

export const compareIllustration = {
  src: "/illustrations/compare-programs.webp",
  alt: "Comparing online degree programs side by side",
};

export const leadWizardSuccessIllustration = {
  src: "/illustrations/lead-wizard-success.webp",
  alt: "Enquiry submitted successfully",
};
