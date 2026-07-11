"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image, { type StaticImageData } from "next/image";
import { useEffect, useRef, useState } from "react";

import image1 from "@/assets/image-1.png";
import image2 from "@/assets/image-2.png";
import image3 from "@/assets/image-3.png";
import image4 from "@/assets/image-4.png";
import image5 from "@/assets/image-5.png";
import mentor1 from "@/assets/mentor-1.png";
import mentor2 from "@/assets/mentor-2.png";
import mentor3 from "@/assets/mentor-3.png";
import mentor4 from "@/assets/mentor-4.png";

const registrationLink =
  "/register";

const rounds = [
  {
    marker: "0.5",
    date: "August 10—27",
    title: "The First Light",
    summary: "An open door for incomplete teams and industry newcomers.",
    detail:
      "Build your team, prove your potential, and compete for one of two direct passes to Round 2.",
  },
  {
    marker: "01",
    date: "September 9—17",
    title: "The Star Gathering",
    summary: "Choose the field where your strongest marketing instincts live.",
    detail:
      "Teams enter Product & Growth, Societal & PR, or Market Research & Trade, with direct one-on-one feedback from industry mentors.",
  },
  {
    marker: "02",
    date: "September 25—October 9",
    title: "The Stellar Forge",
    summary: "The top six teams take on the Diamond Sponsor's challenge.",
    detail:
      "Solutions must balance breakthrough creativity, practical application, and meaningful positive impact for the community.",
  },
  {
    marker: "03",
    date: "Real-world execution",
    title: "The Cosmic Crash",
    summary: "Ideas leave the deck and enter the market.",
    detail:
      "The top four teams turn proposals into live media campaigns, gather real audience response, and prove what can work beyond the brief.",
  },
  {
    marker: "04",
    date: "October 16—17",
    title: "Grand Finale",
    summary: "Networking Night, final campaign pitches, and one last live test.",
    detail:
      "After presenting their executed campaigns, the top two teams solve a surprise mini case on stage under time pressure.",
    finale: true,
  },
] as const;

const mentors: Array<{
  name: string;
  image: StaticImageData;
  description: readonly string[];
}> = [
    {
      name: "Ms. Ngọc Nguyễn",
      image: mentor1,
      description: [
        "Head of Brand Marketing Department at Canifa",
        "Successfully led Canifa’s “Say It Now” and “Yêu Nước Từ Trong Nôi” campaigns, backed by over 15 years of experience",
        "Judge for Z Marketer Season 5 and Hackathon Season 6",
      ],
    },
    {
      name: "Mr. Duy Nguyễn",
      image: mentor2,
      description: [
        "Brand Business Development Manager at Nestlé",
        "Former Senior Brand Manager",
      ],
    },
    {
      name: "Mr. Panos Dimitropoulos",
      image: mentor3,
      description: ["Founder of Two Words Agency", "Former Senior Director at Kantar"],
    },
    {
      name: "Ms. Trang Hoàng",
      image: mentor4,
      description: [
        "Co-Founder of InnoSight Academy",
        "Co-Founder of the Insight2Innovation Podcast",
        "Mentor for the Unilever and Nestlé Vietnam Management Trainee programs",
      ],
    },
  ];

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
            filter: "brightness(0.48) saturate(0.82)",
          },
          {
            yPercent: 9,
            scale: 1.04,
            filter: "brightness(0.32) saturate(0.65)",
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
            filter: "brightness(0.5) saturate(0.78)",
          },
          {
            yPercent: 9,
            scale: 1.04,
            filter: "brightness(0.34) saturate(0.62)",
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
          <a href="#journey">Journey</a>
          <a href="#mentors-sponsors">Partners</a>
        </nav>
        <div className="header-actions">
          <a className="header-login" href="/login">
            Log in
          </a>
          <span className="header-cta is-disabled" aria-label="Ticket sales coming soon">
            Tickets soon
          </span>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-media parallax-media" aria-hidden="true">
            <Image src={image1} alt="" fill priority sizes="100vw" placeholder="blur" />
          </div>
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-orbit orbit-one" aria-hidden="true" />
          <div className="hero-orbit orbit-two" aria-hidden="true" />

          <div className="hero-content page-shell">
            <p className="eyebrow reveal">
              Kotler Klub - VinUni House of Marketers <span>2026</span>
            </p>
            <h1 id="hero-title" className="hero-title reveal uppercase">
              <span>Marketing</span>
              <em>All-Star</em>
              <strong>Challenge</strong>
            </h1>
            <div className="hero-bottom reveal">
              <p>
                Rebirth through innovation. Push past personal limits and leave
                a completely new legacy in marketing.
              </p>
              <a className="primary-button" href={registrationLink}>
                <span>Apply now</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>

          <DeadlineCountdown />
          <div className="hero-meta" aria-label="Participant details">
            <span>Vietnam</span>
            <span>Ages 18—22</span>
            <span>Applications / Jul 10—23</span>
          </div>
          <a className="scroll-cue" href="#about">
            <span /> Scroll to discover
          </a>
        </section>

        <section className="about" id="about" aria-labelledby="about-title">
          <div className="section-glow" aria-hidden="true" />
          <div className="page-shell about-grid">
            <div className="section-heading reveal">
              <p className="section-index">01 / The competition</p>
              <h2 id="about-title">
                A new legacy starts with a <em>collapse.</em>
              </h2>
            </div>
            <div className="about-copy reveal">
              <p className="lead">
                MASC 2026 is an exclusive national competition hosted by Kotler
                Klub—the VinUni House of Marketers.
              </p>
              <p>
                This year&apos;s <strong>Supernova</strong> theme captures the moment
                talent is reborn: old limits give way, innovation erupts, and a
                stronger identity takes shape.
              </p>
            </div>
          </div>

          <div className="portal-wrap page-shell">
            <div className="portal parallax-frame">
              <Image
                src={image2}
                alt="Organizer"
                className="organizer-image"
                fill
                sizes="(max-width: 680px) 100vw, 1360px"
                placeholder="blur"
              />
              <div className="portal-vignette" aria-hidden="true" />
              <p className="portal-label">
                <span>Hosted by Kotler Klub</span>
                <span>VinUni House of Marketers</span>
              </p>
            </div>
            <p className="portal-caption reveal">
              Not a search for safe answers. A proving ground for marketers ready
              to build what comes next.
            </p>
          </div>
        </section>

        <section className="prizes" id="prizes" aria-labelledby="prizes-title">
          <div className="prize-glow" aria-hidden="true" />
          <div className="page-shell">
            <div className="prizes-heading reveal">
              <div>
                <p className="section-index">02 / Prizes &amp; awards</p>
                <p className="prize-overline">For the teams that outshine the rest</p>
              </div>
              <h2 id="prizes-title">
                Great work deserves a <em>stellar reward.</em>
              </h2>
            </div>

            <div className="prize-pool reveal" aria-label="Illustrative total prize pool">
              <div className="prize-pool-copy">
                <span>Estimated total prize pool</span>
                <p>Cash prizes, partner benefits, and opportunities designed to
                  carry winning ideas beyond the competition.</p>
              </div>
              <p className="prize-pool-amount">
                <span>Up to</span>
                100M <small>VND</small>
              </p>
            </div>

            <div className="prize-grid">
              <article className="prize-card grand-prize reveal">
                <div className="prize-rank" aria-hidden="true">01</div>
                <div className="prize-card-copy">
                  <p className="card-kicker">Grand prize / Champion</p>
                  <h3>Supernova<br />Champion</h3>
                  <p>For the team that turns a bold strategy into the year&apos;s most
                    convincing real-world campaign.</p>
                </div>
                <p className="prize-amount">50M <span>VND</span></p>
              </article>

              <article className="prize-card reveal">
                <div className="prize-rank" aria-hidden="true">02</div>
                <div className="prize-card-copy">
                  <p className="card-kicker">Second place / Runner-up</p>
                  <h3>Rising Star</h3>
                  <p>Recognizing sharp insight, ambitious creativity, and a pitch
                    that keeps the pressure on until the final moment.</p>
                </div>
                <p className="prize-amount">30M <span>VND</span></p>
              </article>

              <article className="prize-card reveal">
                <div className="prize-rank" aria-hidden="true">✦</div>
                <div className="prize-card-copy">
                  <p className="card-kicker">Special recognition</p>
                  <h3>Impact Award</h3>
                  <p>Celebrating the campaign that creates the strongest positive
                    impact for its audience and community.</p>
                </div>
                <p className="prize-amount">20M <span>VND</span></p>
              </article>
            </div>

            {/* <p className="prize-disclaimer reveal">
              <span>Note</span> Prize values and benefits shown are illustrative.
              The official award structure will be announced soon.
            </p> */}
          </div>
        </section>

        <section className="why" id="why" aria-labelledby="why-title">
          <div className="why-media parallax-media" aria-hidden="true">
            <Image src={image3} alt="" fill sizes="100vw" placeholder="blur" />
          </div>
          <div className="why-shade" aria-hidden="true" />
          <div className="page-shell why-content">
            <div className="why-heading reveal">
              <p className="section-index">03 / Who can enter</p>
              <h2 id="why-title">
                Built for talent already in <em>motion.</em>
              </h2>
              <p>
                Open to young people aged 18–22 who live and study in Vietnam,
                with the ambition to build a serious career in marketing.
              </p>
            </div>

            <div className="feature-list">
              <Feature number="01" title="Competition Achievers" symbol="✦">
                You have earned high placements in case competitions and are
                ready to turn proven potential into a bigger result.
              </Feature>
              <Feature number="02" title="Student Leaders" symbol="↗">
                You hold an executive role in a university club and know how to
                move teams, ideas, and communities forward.
              </Feature>
              <Feature number="03" title="Future Marketers" symbol="∞">
                You have reached advanced rounds of Management Trainee programs
                or can demonstrate equal drive, discipline, and marketing focus.
              </Feature>
            </div>
          </div>
        </section>

        <section className="journey" id="journey" aria-labelledby="journey-title">
          <div className="page-shell journey-intro reveal">
            <p className="section-index">04 / Interactive timeline</p>
            <h2 id="journey-title">
              From first light
              <br />
              to <em>full impact.</em>
            </h2>
            <p>Select a stage to reveal its challenge, stakes, and progression.</p>
          </div>

          <div className="journey-layout page-shell">
            <div className="timeline" role="list" aria-label="Competition timeline">
              {rounds.map((round) => (
                <TimelineItem key={round.marker} {...round} />
              ))}
            </div>

            <div className="journey-visual" aria-hidden="true">
              <div className="journey-image parallax-frame">
                <Image src={image4} alt="" fill sizes="(max-width: 680px) 100vw, 50vw" placeholder="blur" />
                <div className="journey-vignette" />
              </div>
              <div className="journey-status">
                <span />
                <p>
                  Final trajectory
                  <br />
                  <strong>REAL-WORLD IMPACT</strong>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="criteria" aria-labelledby="criteria-title">
          <div className="criteria-media parallax-media" aria-hidden="true">
            <Image src={image5} alt="" fill sizes="100vw" placeholder="blur" />
          </div>
          <div className="criteria-shade" aria-hidden="true" />
          <div className="page-shell criteria-layout">
            <div className="criteria-intro reveal">
              <p className="section-index">05 / Evaluation Criteria</p>
              <h2 id="criteria-title">What the judges will <em>look for.</em></h2>
            </div>
            <div className="criteria-grid">
              <article className="criteria-card reveal">
                <span>Round 1</span>
                <h3>Specialist clarity</h3>
                <p>Commit to one track and sharpen the work through direct mentor feedback.</p>
              </article>
              <article className="criteria-card reveal">
                <span>Round 2</span>
                <h3>Creative responsibility</h3>
                <p>Balance breakthrough thinking with feasibility and positive community impact.</p>
              </article>
              <article className="criteria-card reveal">
                <span>Finale</span>
                <h3>Execution under pressure</h3>
                <p>Defend real campaign results, then solve an unseen mini case live on stage.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="partners" id="mentors-sponsors" aria-labelledby="partners-title">
          <div className="page-shell partners-heading reveal">
            <div>
              <p className="section-index">06 / Mentors</p>
              <h2 id="partners-title">Guided by people who shape the <em>market.</em></h2>
            </div>
            <p>
              Meet the industry leaders bringing brand, research, and innovation
              expertise directly to this year&apos;s competitors.
            </p>
          </div>
          <div className="page-shell mentor-grid" aria-label="Featured mentors">
            {mentors.map((mentor, index) => (
              <article className="mentor-card reveal" key={mentor.name}>
                <span className="mentor-index">0{index + 1}</span>
                <div className="mentor-portrait">
                  <Image
                    src={mentor.image}
                    alt={`Portrait of ${mentor.name}`}
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
            <p className="section-index">Champion / Runner-up / Second Runner-up</p>
            <h2 id="final-title">
              Claim your place
              <br />
              among the <em>stars.</em>
            </h2>
            <p>
              Applications are open July 10–23 for ambitious marketing talent
              aged 18–22 living and studying in Vietnam.
            </p>
            <a className="primary-button light" href={registrationLink}>
              <span>Begin your journey</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <footer id="contact">
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
            <a href="https://facebook.com/MarketingAllStarChallenge" target="_blank" rel="noreferrer">
              Official Facebook <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="footer-people">
            <p className="footer-label">Organizing leads</p>
            <div className="footer-person">
              <span>Lê Đức Anh — Co-Head</span>
              <a href="tel:+84857129878">0857 129 878</a>
            </div>
            <div className="footer-person">
              <span>Nguyễn Mai Ngọc Nhi — Co-Head</span>
              <a href="tel:+84782356586">0782 356 586</a>
            </div>
            <div className="footer-person">
              <span>Nguyễn Minh Ngọc — External Relations</span>
              <a href="tel:+84965350173">0965 350 173</a>
            </div>
          </div>
          <div className="footer-shortcuts">
            <p className="footer-label">Shortcuts</p>
            <a href="#about">Competition</a>
            <a href="#journey">Timeline</a>
            <a href="#mentors-sponsors">Partners</a>
            <a href="#news">News</a>
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

function DeadlineCountdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const opensAt = new Date("2026-07-10T00:00:00+07:00").getTime();
  const closesAt = new Date("2026-07-23T23:59:59+07:00").getTime();
  const target = now !== null && now >= opensAt ? closesAt : opensAt;
  const remaining = now === null ? target - opensAt : Math.max(0, target - now);
  const isOpen = now !== null && now >= opensAt && now < closesAt;
  const isClosed = now !== null && now >= closesAt;
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining / 3_600_000) % 24);
  const minutes = Math.floor((remaining / 60_000) % 60);
  const seconds = Math.floor((remaining / 1000) % 60);

  return (
    <div className="deadline-panel" aria-live="polite">
      <p>{isClosed ? "Round 0.5 applications" : isOpen ? "Applications close in" : "Round 0.5 opens in"}</p>
      {isClosed ? (
        <strong className="deadline-status">Submissions closed</strong>
      ) : (
        <div className="countdown" aria-label={`${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`}>
          <TimeUnit value={days} label="Days" />
          <TimeUnit value={hours} label="Hours" />
          <TimeUnit value={minutes} label="Minutes" />
          <TimeUnit value={seconds} label="Seconds" />
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
  symbol,
  children,
}: {
  number: string;
  title: string;
  symbol: string;
  children: React.ReactNode;
}) {
  return (
    <article className="feature reveal">
      <span className="feature-number">{number}</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
      <span className="feature-symbol" aria-hidden="true">{symbol}</span>
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
