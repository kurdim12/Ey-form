import RegistrationForm from "@/components/RegistrationForm";
import { strings } from "@/lib/strings";

export default function Home() {
  return (
    <main className="vignette min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-charcoal-line bg-charcoal-soft/70 backdrop-blur-sm px-6 py-8 sm:px-8 sm:py-10 shadow-2xl shadow-black/40">
          <header className="text-center mb-8">
            <p className="uppercase tracking-[0.3em] text-xs text-gold mb-3">
              {strings.form.subheading}
            </p>
            <h1 className="font-serif text-4xl sm:text-5xl text-cream leading-tight">
              {strings.form.heading}
            </h1>
            <div className="gold-rule my-5 mx-auto w-2/3" />
            <p className="text-sm text-cream-dim">{strings.form.intro}</p>
          </header>

          <RegistrationForm />
        </div>

        <p className="text-center text-xs text-cream-dim/70 mt-6">
          {strings.event.location}
        </p>
      </div>
    </main>
  );
}
