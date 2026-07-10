"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import { useEffect, useRef } from "react";

import image1 from "@/assets/image-1.png";
import image2 from "@/assets/image-2.png";
import image3 from "@/assets/image-3.png";
import image4 from "@/assets/image-4.png";

const registrationLink =
  "mailto:masc26.info@gmail.com?subject=MASC%202026%20Registration";

export default function Home() {
  const pageRef = useRef<HTMLDivElement>(null);

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

        gsap.to(".hero-media img", {
          yPercent: 12,
          scale: 1.08,
          ease: "none",
          scrollTrigger: {
            trigger: ".hero",
            start: "top top",
            end: "bottom top",
            scrub: 1.2,
          },
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
          ".portal img",
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
            filter: "brightness(0.58) saturate(0.82)",
          },
          {
            yPercent: 9,
            scale: 1.04,
            filter: "brightness(0.36) saturate(0.65)",
            ease: "none",
            scrollTrigger: {
              trigger: ".why",
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
                toggleActions: "play reverse play reverse",
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

      <header className="site-header">
        <a className="brand" href="#top" aria-label="MASC 2026 — back to top">
          <span className="brand-mark">M</span>
          <span className="brand-copy">
            MASC
            <br />
            <small>SUPERNOVA &apos;26</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#about">About</a>
          <a href="#why">Why join</a>
          <a href="#journey">Journey</a>
        </nav>
        <a className="header-cta" href={registrationLink}>
          Register <span aria-hidden="true">↗</span>
        </a>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-media parallax-media" aria-hidden="true">
            <Image
              src={image1}
              alt=""
              fill
              priority
              sizes="100vw"
              placeholder="blur"
            />
          </div>
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-orbit orbit-one" aria-hidden="true" />
          <div className="hero-orbit orbit-two" aria-hidden="true" />

          <div className="hero-content page-shell">
            <p className="eyebrow reveal">
              Marketing All-Star Challenge <span>2026</span>
            </p>
            <h1 id="hero-title" className="hero-title reveal">
              <span>Rise beyond.</span>
              <em>Become the</em>
              <strong>Supernova.</strong>
            </h1>
            <div className="hero-bottom reveal">
              <p>
                Step into the ultimate arena for young marketers to push their
                limits, embrace innovation, and create a lasting legacy.
              </p>
              <a className="primary-button" href={registrationLink}>
                <span>Register now</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>

          <div className="hero-meta" aria-label="Registration details">
            <span>Open across Vietnam</span>
            <span>Ages 18—22</span>
            <span>10.07—23.07</span>
          </div>
          <a className="scroll-cue" href="#about">
            <span /> Scroll to discover
          </a>
        </section>

        <section className="about" id="about" aria-labelledby="about-title">
          <div className="section-glow" aria-hidden="true" />
          <div className="page-shell about-grid">
            <div className="section-heading reveal">
              <p className="section-index">01 / The challenge</p>
              <h2 id="about-title">
                Where proven talent becomes <em>stellar.</em>
              </h2>
            </div>
            <div className="about-copy reveal">
              <p className="lead">
                Not another case competition. MASC is an invitation to the young
                marketers already shaping what comes next.
              </p>
              <p>
                Hosted by <strong>Kotler Klub</strong>, the first marketing club at
                VinUniversity, the challenge is designed for students who have
                earned high ranks in marketing competitions, led university
                business clubs, or advanced in Management Trainee programs.
              </p>
            </div>
          </div>

          <div className="portal-wrap page-shell">
            <div className="portal parallax-frame">
              <Image
                src={image2}
                alt="A luminous figure moving through a colorful field of light"
                fill
                sizes="(max-width: 680px) 100vw, 1360px"
                placeholder="blur"
              />
              <div className="portal-vignette" aria-hidden="true" />
              <p className="portal-label">
                <span>Enter the arena</span>
                <span>MASC / 2026</span>
              </p>
            </div>
            <p className="portal-caption reveal">
              A national arena built for those ready to move from potential to
              impact.
            </p>
          </div>
        </section>

        <section className="why" id="why" aria-labelledby="why-title">
          <div className="why-media parallax-media" aria-hidden="true">
            <Image
              src={image3}
              alt=""
              fill
              sizes="100vw"
              placeholder="blur"
            />
          </div>
          <div className="why-shade" aria-hidden="true" />
          <div className="page-shell why-content">
            <div className="why-heading reveal">
              <p className="section-index">02 / Why join</p>
              <h2 id="why-title">
                Built to go <em>beyond the brief.</em>
              </h2>
              <p>
                Three ways MASC turns raw ambition into work that survives the
                real world.
              </p>
            </div>

            <div className="feature-list">
              <article className="feature reveal">
                <span className="feature-number">01</span>
                <div>
                  <h3>Personalized Tracks</h3>
                  <p>
                    Choose Product &amp; Growth, Societal + PR/MarCom, or Market
                    Research + Trade—then sharpen your edge through 1-on-1
                    guidance from industry mentors.
                  </p>
                </div>
                <span className="feature-symbol" aria-hidden="true">
                  ✦
                </span>
              </article>
              <article className="feature reveal">
                <span className="feature-number">02</span>
                <div>
                  <h3>Real-World Execution</h3>
                  <p>
                    The top 4 teams will not stop at pitching ideas. They will
                    deploy actual campaigns, meet the market, and prove what
                    works.
                  </p>
                </div>
                <span className="feature-symbol" aria-hidden="true">
                  ↗
                </span>
              </article>
              <article className="feature reveal">
                <span className="feature-number">03</span>
                <div>
                  <h3>Dual-Challenge Finale</h3>
                  <p>
                    Pitch your executed campaign, then solve a live Mini Case
                    under time pressure. Strategy and instinct, tested on one
                    stage.
                  </p>
                </div>
                <span className="feature-symbol" aria-hidden="true">
                  ∞
                </span>
              </article>
            </div>
          </div>
        </section>

        <section
          className="journey"
          id="journey"
          aria-labelledby="journey-title"
        >
          <div className="page-shell journey-intro reveal">
            <p className="section-index">03 / The journey</p>
            <h2 id="journey-title">
              From first light
              <br />
              to <em>full impact.</em>
            </h2>
            <p>
              Five stages. Three specialist tracks. One chance to leave a mark
              that outlives the moment.
            </p>
          </div>

          <div className="journey-layout page-shell">
            <div className="timeline" role="list" aria-label="Competition timeline">
              <TimelineItem
                marker="0.5"
                date="August 10—24"
                title="The First Light"
              >
                A special opening round for newcomers to earn a direct pass to
                Round 2 or bypass the CV screening.
              </TimelineItem>
              <TimelineItem
                marker="01"
                date="Specialized tracks"
                title="The Star Gathering"
              >
                Competitors split into their three chosen tracks and solve
                sharply focused marketing problems.
              </TimelineItem>
              <TimelineItem
                marker="02"
                date="Top 6 teams"
                title="The Stellar Forge"
              >
                The strongest teams tackle a cultural and social case provided
                by the Diamond Sponsor.
              </TimelineItem>
              <TimelineItem
                marker="03"
                date="Top 4 teams"
                title="The Cosmic Crash"
              >
                Proposals leave the page as finalists bring their campaigns to
                life through real-world execution.
              </TimelineItem>
              <TimelineItem
                marker="04"
                date="October 16—17"
                title="Grand Finale"
                finale
              >
                Networking Night on October 16, followed by Final Pitching and
                the live Mini Case on October 17.
              </TimelineItem>
            </div>

            <div className="journey-visual" aria-hidden="true">
              <div className="journey-image parallax-frame">
                <Image
                  src={image4}
                  alt=""
                  fill
                  sizes="(max-width: 680px) 100vw, 50vw"
                  placeholder="blur"
                />
                <div className="journey-vignette" />
              </div>
              <div className="journey-status">
                <span />
                <p>
                  Current trajectory
                  <br />
                  <strong>SUPERNOVA</strong>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="final-cta" aria-labelledby="final-title">
          <div className="final-orbit" aria-hidden="true" />
          <div className="page-shell final-content reveal">
            <p className="section-index">Your move / 2026</p>
            <h2 id="final-title">
              Don&apos;t just watch
              <br />
              the future <em>happen.</em>
            </h2>
            <p>
              Register from July 10 to July 23. Open to young talents aged 18 to
              22 across Vietnam.
            </p>
            <a className="primary-button light" href={registrationLink}>
              <span>Begin your journey</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <footer>
        <div className="page-shell footer-grid">
          <div className="footer-brand">
            <span className="brand-mark">M</span>
            <p>
              Marketing All-Star
              <br />
              Challenge 2026
            </p>
          </div>
          <div className="footer-contact">
            <p className="footer-label">Questions &amp; support</p>
            <a href="mailto:masc26.info@gmail.com">masc26.info@gmail.com</a>
            <a
              href="https://facebook.com/MarketingAllStarChallenge"
              target="_blank"
              rel="noreferrer"
            >
              Facebook <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="footer-people">
            <p className="footer-label">Contact persons</p>
            <p>
              Mr. Leu Duc Anh
              <br />
              Ms. Nguyen Mai Ngoc Nhi
              <br />
              Ms. Nguyen Minh Ngoc
            </p>
          </div>
        </div>
        <div className="page-shell footer-bottom">
          <span>Hosted by Kotler Klub, VinUniversity</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </div>
  );
}

function TimelineItem({
  marker,
  date,
  title,
  finale = false,
  children,
}: {
  marker: string;
  date: string;
  title: string;
  finale?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`timeline-item${finale ? " finale-item" : ""}`}
      role="listitem"
    >
      <div className="timeline-marker">
        <span>{marker}</span>
      </div>
      <div className="timeline-copy">
        <p className="timeline-date">{date}</p>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </article>
  );
}
