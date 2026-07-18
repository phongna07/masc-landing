"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import image1 from "@/assets/image-1.png";
import image2 from "@/assets/image-2.png";
import image3 from "@/assets/image-3.png";
import image4 from "@/assets/image-4.png";
import footerLogo from "@/assets/footer-logo.png";
import mentor1 from "@/assets/mentor-1.png";
import mentor2 from "@/assets/mentor-2.png";
import mentor3 from "@/assets/mentor-3.png";
import mentor4 from "@/assets/mentor-4.png";
import { HeroBrandLogo } from "@/components/hero-brand-logo";
import SiteHeader from "@/components/site-header";
import { authClient } from "@/lib/auth-client";
import { env } from "@masc-landing/env/web";

export default function Home() {
  const t = useTranslations("Home");
  const pageRef = useRef<HTMLDivElement>(null);
  const { data: session, isPending } = authClient.useSession();
  const isSignedIn = !isPending && Boolean(session?.user);
  const registrationLink = isSignedIn ? "/dashboard" : "/login";
  const rounds = [
    { marker: "00", key: "round05" },
    { marker: "01", key: "round1" },
    { marker: "02", key: "round2" },
    { marker: "03", key: "round3" },
    { marker: "04", key: "round4", finale: true },
  ].map((round) => ({
    marker: round.marker,
    date: t(`journey.rounds.${round.key}.date`),
    title: t(`journey.rounds.${round.key}.title`),
    summary: t(`journey.rounds.${round.key}.summary`),
    detail: t(`journey.rounds.${round.key}.detail`),
    finale: round.finale,
  }));
  const mentors: Array<{
    name: string;
    image: StaticImageData;
    description: string[];
  }> = [
      {
        name: t("mentors.mentor1.name"),
        image: mentor1,
        description: [
          t("mentors.mentor1.description1"),
          t("mentors.mentor1.description2"),
        ],
      },
      {
        name: t("mentors.mentor2.name"),
        image: mentor2,
        description: [
          t("mentors.mentor2.description1"),
          t("mentors.mentor2.description2"),
        ],
      },
      {
        name: t("mentors.mentor3.name"),
        image: mentor3,
        description: [
          t("mentors.mentor3.description1"),
          t("mentors.mentor3.description2"),
        ],
      },
      {
        name: t("mentors.mentor4.name"),
        image: mentor4,
        description: [
          t("mentors.mentor4.description1"),
          t("mentors.mentor4.description2"),
          t("mentors.mentor4.description3"),
        ],
      },
    ];

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (!prefersReducedMotion) {
        gsap.set(".reveal", { y: 34, opacity: 0 });

        ScrollTrigger.batch(".reveal", {
          start: "top 88%",
          once: true,
          onEnter: (elements) =>
            gsap.to(elements, {
              y: 0,
              opacity: 1,
              duration: 1,
              stagger: 0.12,
              ease: "power3.out",
              overwrite: true,
            }),
        });

        gsap.to(".hero-content", {
          yPercent: 16,
          opacity: 0.25,
          ease: "none",
          scrollTrigger: {
            trigger: ".hero",
            start: "35% top",
            end: "bottom top",
            scrub: 0.8,
          },
        });

        gsap.fromTo(
          ".organizer-image",
          { yPercent: -10, scale: 1.12 },
          {
            yPercent: 10,
            scale: 1.03,
            ease: "none",
            scrollTrigger: {
              trigger: ".portal-wrap",
              start: "top bottom",
              end: "bottom top",
              scrub: 1.1,
            },
          },
        );

        gsap.fromTo(
          ".why-media img",
          {
            yPercent: -8,
            scale: 1.13,
            filter: "brightness(0.7) saturate(0.96)",
          },
          {
            yPercent: 9,
            scale: 1.04,
            filter: "brightness(0.56) saturate(0.82)",
            ease: "none",
            scrollTrigger: {
              trigger: ".why",
              start: "top bottom",
              end: "bottom top",
              scrub: 1.25,
            },
          },
        );

        gsap.fromTo(
          ".criteria-media img",
          {
            yPercent: -8,
            scale: 1.13,
            filter: "brightness(0.68) saturate(0.92)",
          },
          {
            yPercent: 9,
            scale: 1.04,
            filter: "brightness(0.54) saturate(0.8)",
            ease: "none",
            scrollTrigger: {
              trigger: ".criteria",
              start: "top bottom",
              end: "bottom top",
              scrub: 1.25,
            },
          },
        );

        gsap.utils.toArray<HTMLElement>(".timeline-item").forEach((item) => {
          gsap.fromTo(
            item,
            { opacity: 0.28 },
            {
              opacity: 1,
              scrollTrigger: {
                trigger: item,
                start: "top 68%",
                end: "bottom 42%",
                scrub: true,
              },
            },
          );
        });

        gsap.fromTo(
          ".journey-image img",
          { yPercent: -7, scale: 1.1 },
          {
            yPercent: 7,
            scale: 1.02,
            ease: "none",
            scrollTrigger: {
              trigger: ".journey-layout",
              start: "top bottom",
              end: "bottom top",
              scrub: 1.2,
            },
          },
        );

        gsap.to(".final-orbit", {
          rotate: 35,
          scale: 1.14,
          ease: "none",
          scrollTrigger: {
            trigger: ".final-cta",
            start: "top bottom",
            end: "bottom top",
            scrub: 1.5,
          },
        });

        gsap.to(".scroll-progress span", {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { start: 0, end: "max", scrub: 0.15 },
        });
      }

      const header = document.querySelector<HTMLElement>(".site-header");
      ScrollTrigger.create({
        start: 80,
        onUpdate: ({ scroll }) =>
          header?.classList.toggle("is-scrolled", scroll() > 80),
      });
    }, pageRef);

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    requestAnimationFrame(refresh);

    return () => {
      window.removeEventListener("load", refresh);
      context.revert();
    };
  }, []);

  return (
    <div ref={pageRef} className="landing-page">
      <div className="scroll-progress" aria-hidden="true">
        <span />
      </div>

      <SiteHeader landingPage />

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-background" aria-hidden="true">
            <Image
              src={image1}
              alt=""
              fill
              priority
              sizes="100vw"
            />
          </div>

          <div className="hero-shade" aria-hidden="true" />

          <div className="hero-content page-shell">
            <div className="hero-copy">
              <p className="eyebrow reveal">
                <span className="eyebrow-star" aria-hidden="true">✦</span>
                {t("hero.eyebrow")} <b>2026</b>
              </p>
              <h1 id="hero-title" className="hero-title reveal">
                <span>{t("hero.titleMarketing")}</span>
                <em>{t("hero.titleAllStar")}</em>
                <strong>{t("hero.titleChallenge")}</strong>
              </h1>
              <div className="hero-bottom reveal">
                <p>{t("hero.description")}</p>
                {env.NEXT_PUBLIC_IS_REGISTRATION_OPENED && (
                  <div className="hero-brand-action">
                    <Link className="primary-button hero-brand-button" href={registrationLink}>
                      <span>{isSignedIn ? t("hero.portal") : t("hero.apply")}</span>
                      <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>

            <div className="hero-brand-stage">
              <div className="hero-brand-art" aria-hidden="true">
                <div className="hero-brand-glow" />
                <div className="hero-brand-orbit hero-brand-orbit-outer"><span /></div>
                <div className="hero-brand-orbit hero-brand-orbit-inner"><span /></div>
                <div className="hero-brand-image">
                  <HeroBrandLogo />
                </div>
                <span className="brand-spark brand-spark-one">✦</span>
                <span className="brand-spark brand-spark-two">✦</span>
                <span className="brand-spark brand-spark-three">✦</span>
              </div>
            </div>
          </div>

          {env.NEXT_PUBLIC_IS_REGISTRATION_OPENED && <DeadlineCountdown />}
          <div className="hero-meta" aria-label={t("hero.participantDetails")}>
            <span>{t("hero.country")}</span>
            <span>{t("hero.age")}</span>
            <span>{t("hero.applications")}</span>
          </div>
          <a className="scroll-cue" href="#about">
            <span /> {t("hero.scroll")}
          </a>
        </section>

        <section className="about" id="about" aria-labelledby="about-title">
          <div className="section-glow" aria-hidden="true" />
          <div className="page-shell about-grid">
            <div className="section-heading reveal">
              <p className="section-index">{t("about.index")}</p>
              <h2 id="about-title">{t.rich("about.title", { em: (chunks) => <em>{chunks}</em> })}</h2>
            </div>
            <div className="about-copy reveal">
              <p className="lead">{t("about.lead")}</p>
              <p>{t.rich("about.description", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
            </div>
          </div>

          <div className="portal-wrap page-shell">
            <div className="portal parallax-frame">
              <Image
                src={image2}
                alt={t("about.organizerAlt")}
                className="organizer-image"
                fill
                sizes="(max-width: 680px) 100vw, 1360px"
                placeholder="blur"
              />
              <p className="portal-label">
                <span>{t("about.hostedBy")}</span>
                <span>{t("about.organization")}</span>
              </p>
            </div>
            <p className="portal-caption reveal">{t("about.caption")}</p>
          </div>
        </section>

        {/* <section className="prizes" id="prizes" aria-labelledby="prizes-title">
          <div className="prize-glow" aria-hidden="true" />
          <div className="page-shell">
            <div className="prizes-heading reveal">
              <div>
                <p className="section-index">{t("prizes.index")}</p>
                <p className="prize-overline">{t("prizes.overline")}</p>
              </div>
              <h2 id="prizes-title">{t.rich("prizes.title", { em: (chunks) => <em>{chunks}</em> })}</h2>
            </div>

            <div className="prize-pool reveal" aria-label={t("prizes.poolLabel")}>
              <div className="prize-pool-copy">
                <span>{t("prizes.poolTitle")}</span>
                <p>{t("prizes.poolDescription")}</p>
              </div>
              <p className="prize-pool-amount">
                <span>{t("prizes.upTo")}</span>
                100M <small>VND</small>
              </p>
            </div>

            <div className="prize-grid">
              <article className="prize-card grand-prize reveal">
                <div className="prize-rank" aria-hidden="true">01</div>
                <div className="prize-card-copy">
                  <p className="card-kicker">{t("prizes.grandKicker")}</p>
                  <h3>{t.rich("prizes.grandTitle", { break: () => <br /> })}</h3>
                  <p>{t("prizes.grandDescription")}</p>
                </div>
                <p className="prize-amount">50M <span>VND</span></p>
              </article>

              <article className="prize-card reveal">
                <div className="prize-rank" aria-hidden="true">02</div>
                <div className="prize-card-copy">
                  <p className="card-kicker">{t("prizes.secondKicker")}</p>
                  <h3>{t("prizes.secondTitle")}</h3>
                  <p>{t("prizes.secondDescription")}</p>
                </div>
                <p className="prize-amount">30M <span>VND</span></p>
              </article>

              <article className="prize-card reveal">
                <div className="prize-rank" aria-hidden="true">✦</div>
                <div className="prize-card-copy">
                  <p className="card-kicker">{t("prizes.impactKicker")}</p>
                  <h3>{t("prizes.impactTitle")}</h3>
                  <p>{t("prizes.impactDescription")}</p>
                </div>
                <p className="prize-amount">20M <span>VND</span></p>
              </article>
            </div>
          </div>
        </section> */}

        <section className="why" id="why" aria-labelledby="why-title">
          <div className="why-media parallax-media" aria-hidden="true">
            <Image src={image3} alt="" fill sizes="100vw" placeholder="blur" />
          </div>
          <div className="why-shade" aria-hidden="true" />
          <div className="page-shell why-content">
            <div className="why-heading reveal">
              <p className="section-index">{t("eligibility.index")}</p>
              <h2 id="why-title">{t.rich("eligibility.title", { em: (chunks) => <em>{chunks}</em> })}</h2>
              <p>{t("eligibility.description")}</p>
            </div>

            <div className="feature-list">
              <Feature number="01" title={t("eligibility.achieverTitle")}>
                {t("eligibility.achieverDescription")}
              </Feature>
              <Feature number="02" title={t("eligibility.leaderTitle")}>
                {t("eligibility.leaderDescription")}
              </Feature>
              <Feature number="03" title={t("eligibility.marketerTitle")}>
                {t("eligibility.marketerDescription")}
              </Feature>
            </div>
          </div>
        </section>

        <section className="journey" id="journey" aria-labelledby="journey-title">
          <div className="page-shell journey-intro reveal">
            <p className="section-index">{t("journey.index")}</p>
            <h2 id="journey-title">
              {t.rich("journey.title", {
                break: () => <br />,
                em: (chunks) => <em>{chunks}</em>,
              })}
            </h2>
            <p>{t("journey.description")}</p>
          </div>

          <div className="journey-layout page-shell">
            <div className="timeline" role="list" aria-label={t("journey.timelineLabel")}>
              {rounds.map((round) => (
                <TimelineItem key={round.marker} {...round} />
              ))}
            </div>

            <div className="journey-visual" aria-hidden="true">
              <div className="journey-image parallax-frame">
                <Image src={image4} alt="" fill sizes="(max-width: 680px) 100vw, 50vw" placeholder="blur" />
                <div className="journey-vignette" />
              </div>
            </div>
          </div>
        </section>

        <section className="criteria" aria-labelledby="criteria-title">
          <div className="criteria-media parallax-media" aria-hidden="true">
            <Image src={image3} alt="" fill sizes="100vw" placeholder="blur" />
          </div>
          <div className="criteria-shade" aria-hidden="true" />
          <div className="page-shell criteria-layout">
            <div className="criteria-intro reveal">
              <p className="section-index">{t("criteria.index")}</p>
              <h2 id="criteria-title">{t.rich("criteria.title", { em: (chunks) => <em>{chunks}</em> })}</h2>
            </div>
            <div className="criteria-grid">
              <article className="criteria-card reveal">
                <span>{t("criteria.round1")}</span>
                <h3>{t("criteria.round1Title")}</h3>
                <p>{t("criteria.round1Description")}</p>
              </article>
              <article className="criteria-card reveal">
                <span>{t("criteria.round2")}</span>
                <h3>{t("criteria.round2Title")}</h3>
                <p>{t("criteria.round2Description")}</p>
              </article>
              <article className="criteria-card reveal">
                <span>{t("criteria.finale")}</span>
                <h3>{t("criteria.finaleTitle")}</h3>
                <p>{t("criteria.finaleDescription")}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="partners" id="mentors-sponsors" aria-labelledby="partners-title">
          <div className="page-shell partners-heading reveal">
            <div>
              <p className="section-index">{t("mentors.index")}</p>
              <h2 id="partners-title">{t.rich("mentors.title", { em: (chunks) => <em>{chunks}</em> })}</h2>
            </div>
            <p>{t("mentors.description")}</p>
          </div>
          <div className="page-shell mentor-grid" aria-label={t("mentors.featuredLabel")}>
            {mentors.map((mentor, index) => (
              <article className="mentor-card reveal" key={mentor.name}>
                <span className="mentor-index">0{index + 1}</span>
                <div className="mentor-portrait">
                  <Image
                    src={mentor.image}
                    alt={t("mentors.portraitAlt", { name: mentor.name })}
                    fill
                    sizes="(max-width: 720px) 72vw, (max-width: 1100px) 36vw, 260px"
                    placeholder="blur"
                  />
                </div>
                <div className="mentor-copy">
                  <h3>{mentor.name}</h3>
                  <ul>
                    {mentor.description.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="final-cta" aria-labelledby="final-title">
          <div className="final-orbit" aria-hidden="true" />
          <div className="page-shell final-content reveal">
            <p className="section-index">{t("finalCta.index")}</p>
            <h2 id="final-title">
              {t.rich("finalCta.title", {
                break: () => <br />,
                em: (chunks) => <em>{chunks}</em>,
              })}
            </h2>
            <p>{t("finalCta.description")}</p>
            {env.NEXT_PUBLIC_IS_REGISTRATION_OPENED && (
              <Link className="primary-button light" href={registrationLink}>
                <span>{isSignedIn ? t("finalCta.portal") : t("finalCta.button")}</span>
                <span aria-hidden="true">↗</span>
              </Link>
            )}
          </div>
        </section>
      </main>

      <footer id="contact">
        <div className="page-shell footer-grid">
          <div className="footer-brand">
            <Image
              src={footerLogo}
              alt="Marketing All-Star Challenge 2026"
              className="footer-logo"
              sizes="(max-width: 680px) 80px, 100px"
            />
          </div>
          <div className="footer-contact">
            <p className="footer-label">{t("footer.support")}</p>
            <a href="mailto:masc26.work@gmail.com">masc26.work@gmail.com</a>
            <a href="https://facebook.com/MarketingAllStarChallenge" target="_blank" rel="noreferrer">
              {t("footer.facebook")} <span aria-hidden="true">↗</span>
            </a>
            <a href="https://www.facebook.com/share/g/1CfwmYmFPi/" target="_blank" rel="noreferrer">
              {t("footer.facebookGroupCommunity")} <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="footer-people">
            <p className="footer-label">{t("footer.leads")}</p>
            <div className="footer-person">
              <span>{t("footer.lead1Name")}</span>
              <span className="footer-person-role">{t("footer.lead1Role")}</span>
              <a href="tel:+84857129878">+84 857 129 878</a>
            </div>
            <div className="footer-person">
              <span>{t("footer.lead2Name")}</span>
              <span className="footer-person-role">{t("footer.lead2Role")}</span>
              <a href="tel:+84782356586">+84 782 356 586</a>
            </div>
            <div className="footer-person">
              <span>{t("footer.lead3Name")}</span>
              <span className="footer-person-role">{t("footer.lead3Role")}</span>
              <a href="tel:+84965350173">+84 965 350 173</a>
            </div>
          </div>
          <div className="footer-shortcuts">
            <p className="footer-label">{t("footer.shortcuts")}</p>
            <a href="#about">{t("footer.competition")}</a>
            <a href="#journey">{t("footer.timeline")}</a>
            <a href="#mentors-sponsors">{t("footer.partners")}</a>
            <a href="https://www.facebook.com/MarketingAllStarChallenge" target="_blank">{t("footer.news")}</a>
          </div>
        </div>
        <div className="page-shell footer-bottom">
          <span>{t("footer.hosted")}</span>
          <a href="#top">{t("footer.backToTop")}</a>
        </div>
      </footer>
    </div>
  );
}

function DeadlineCountdown() {
  const t = useTranslations("Home.countdown");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const target = new Date("2026-08-10T23:59:00+07:00").getTime();
  const remaining = now === null ? 0 : Math.max(0, target - now);
  const isClosed = now !== null && now >= target;
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining / 3_600_000) % 24);
  const minutes = Math.floor((remaining / 60_000) % 60);
  const seconds = Math.floor((remaining / 1000) % 60);

  return (
    <div className="deadline-panel" aria-live="polite">
      <p>{isClosed ? t("applications") : t("closesIn")}</p>
      {isClosed ? (
        <strong className="deadline-status">{t("closed")}</strong>
      ) : (
        <div className="countdown" aria-label={t("aria", { days, hours, minutes, seconds })}>
          <TimeUnit value={days} label={t("days")} />
          <TimeUnit value={hours} label={t("hours")} />
          <TimeUnit value={minutes} label={t("minutes")} />
          <TimeUnit value={seconds} label={t("seconds")} />
        </div>
      )}
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <strong>{String(value).padStart(2, "0")}</strong>
      <small>{label}</small>
    </span>
  );
}

function Feature({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="feature reveal">
      <span className="feature-number">{number}</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </article>
  );
}

function TimelineItem({
  marker,
  date,
  title,
  summary,
  detail,
  finale = false,
}: {
  marker: string;
  date: string;
  title: string;
  summary: string;
  detail: string;
  finale?: boolean;
}) {
  return (
    <article className={`timeline-item${finale ? " finale-item" : ""}`} role="listitem">
      <div className="timeline-marker"><span>{marker}</span></div>
      <div className="timeline-copy">
        <span className="timeline-date">{date}</span>
        <span className="timeline-title-row">
          <span className="timeline-title">{title}</span>
        </span>
        <span className="timeline-summary">{summary}</span>
        <p className="timeline-detail">{detail}</p>
      </div>
    </article>
  );
}
