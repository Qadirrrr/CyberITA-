import { Link } from 'react-router-dom';
import { Link as RouterLink } from 'react-router-dom';
import { Badge, Button, Card, SectionHeading } from '../../components/ui';
import {
  IconArrowRight,
  IconAward,
  IconBookOpen,
  IconCheckCircle,
  IconFileText,
  IconRocket,
  IconShield,
  IconTarget,
  IconTerminal,
  IconUsers,
  IconZap,
} from '../../components/icons';

const values = [
  {
    icon: IconTerminal,
    title: 'Practice over theory',
    body: 'Reading about permissions is not the same as changing them. Every concept is paired with a lab where you prove it works.',
  },
  {
    icon: IconFileText,
    title: 'Evidence over claims',
    body: 'Your commands, outputs and screenshots become a structured report. You leave with documentation, not just a checkbox.',
  },
  {
    icon: IconShield,
    title: 'Safety by default',
    body: 'Labs run in isolated, disposable sandboxes. Break things, reset, try again, with zero risk to your own machine.',
  },
  {
    icon: IconUsers,
    title: 'Feedback from practitioners',
    body: 'Instructors review reports and grade assignments with the kind of feedback you would get on a real team.',
  },
];

const team = [
  {
    name: 'Sarah Chen',
    role: 'Lead Instructor · Linux & Cloud',
    bio: 'Former platform engineer who has run production Linux fleets at scale. Sarah designs the Linux and cloud labs.',
    initials: 'SC',
  },
  {
    name: 'Marcus Reid',
    role: 'Instructor · Networking & Security',
    bio: 'Network and security specialist with a decade of incident response experience. Marcus builds the networking and cyber ranges.',
    initials: 'MR',
  },
  {
    name: 'CyberITA+ Faculty',
    role: 'Curriculum & review',
    bio: 'A small team of practitioners who review every report, keep labs current and publish learner work that meets the bar.',
    initials: 'C+',
  },
];

export default function AboutPage() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-70" />
        <div className="container-page relative grid gap-10 py-12 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:py-20">
          <div>
            <Badge tone="brand" className="mb-4">
              <IconRocket size={13} /> About CyberITA+
            </Badge>
            <h1 className="text-balance font-display text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
              We believe IT skills should be demonstrated, not assumed.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-400">
              CyberITA+ started with a simple observation: most online IT courses test whether you watched a video, not
              whether you can do the job. We built a platform where every lesson ends in a terminal, every lab step is
              verified, and every learner leaves with documented proof of their work.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button as={Link} to="/courses" size="lg">
                Explore courses <IconArrowRight size={17} />
              </Button>
              <Button as={Link} to="/contact" variant="secondary" size="lg">
                Get in touch
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['100%', 'Browser-based labs'],
              ['Verified', 'Every lab step'],
              ['Reviewed', 'Every published report'],
              ['Serialised', 'Every certificate'],
            ].map(([value, label]) => (
              <Card key={label} className="p-5">
                <p className="font-display text-2xl font-semibold text-brand-300">{value}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{label}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-14 lg:py-20">
        <SectionHeading
          eyebrow="Our approach"
          title="A loop that actually builds skill"
          description="Learn, execute, document, review. Each stage reinforces the last, and produces something you can show."
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: IconBookOpen, step: '01', title: 'Learn the concept', body: 'Short, focused lessons written by practitioners, no filler, no 40-minute videos.' },
            { icon: IconTerminal, step: '02', title: 'Run it for real', body: 'Apply it immediately in a sandboxed terminal. Commands are checked as you go.' },
            { icon: IconFileText, step: '03', title: 'Document the work', body: 'Your verified commands, output and screenshots become a structured practical report.' },
            { icon: IconAward, step: '04', title: 'Get it recognised', body: 'Instructor feedback, a verifiable certificate and, if you choose, a published article.' },
          ].map((item) => {
            const IconComponent = item.icon;
            return (
              <Card key={item.step} className="relative overflow-hidden p-6">
                <span className="absolute right-4 top-3 font-display text-4xl font-semibold text-white/[0.04]">{item.step}</span>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300">
                  <IconComponent size={21} />
                </span>
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-y border-white/5 bg-night-900/30">
        <div className="container-page py-14 lg:py-20">
          <SectionHeading eyebrow="What we stand for" title="Principles, not platitudes" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {values.map((value) => {
              const IconComponent = value.icon;
              return (
                <Card key={value.title} className="flex gap-4 p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/20 to-accent-500/10 text-brand-300">
                    <IconComponent size={20} />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{value.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-400">{value.body}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container-page py-14 lg:py-20">
        <SectionHeading
          eyebrow="Who teaches here"
          title="Practitioners who still use the tools"
          description="Our instructors have operated the systems they teach, and they review the work you submit."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {team.map((member) => (
            <Card key={member.name} className="p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/30 to-accent-500/30 font-display text-lg font-semibold text-brand-200 ring-1 ring-white/10">
                {member.initials}
              </div>
              <h3 className="mt-4 text-base font-semibold">{member.name}</h3>
              <p className="mt-0.5 text-xs font-medium text-brand-300">{member.role}</p>
              <p className="mt-3 text-sm leading-6 text-slate-400">{member.bio}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="container-page pb-16 lg:pb-24">
        <Card className="border-brand-400/20 bg-gradient-to-br from-brand-500/[0.1] via-night-900 to-accent-500/[0.08] p-8 text-center sm:p-12">
          <Badge tone="brand" className="mb-4">
            <IconSparklesIcon /> Start learning today
          </Badge>
          <h2 className="mx-auto max-w-2xl text-balance font-display text-2xl font-semibold sm:text-3xl">
            The best way to understand CyberITA+ is to run your first command.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">
            Create a free account, open a lab and see your progress verified in real time.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button as={RouterLink} to="/register" size="lg">
              Create free account <IconArrowRight size={17} />
            </Button>
            <Button as={RouterLink} to="/courses" variant="secondary" size="lg">
              Browse courses
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
            {['No credit card', 'Cancel anytime', 'Verified certificates'].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <IconCheckCircle size={13} className="text-brand-400" /> {item}
              </span>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

function IconSparklesIcon() {
  return <IconZap size={13} />;
}
