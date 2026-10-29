import type { CareerMap } from '@shared/career-map';

type ProjectBrief = Pick<CareerMap['projects'][number], 'title' | 'learningGoal' | 'firstVersion' | 'firstStep' | 'relationship'>;

export function projectBriefSections(project: ProjectBrief) {
  return [
    { label: "What you'll learn", text: project.learningGoal },
    { label: "What you'll make", text: project.firstVersion },
    { label: 'Suggested starting point', text: project.firstStep },
  ];
}

export function ChatProjectBrief({ project }: { project: ProjectBrief & { id: string; revision: number } }) {
  return (
    <section data-project-brief={`${project.id}@${project.revision}`} className="mx-auto w-full max-w-[38rem] break-words text-[1.0625rem] font-medium leading-7 [unicode-bidi:plaintext]">
      <h2 className="text-xl font-bold">{project.title}</h2>
      {project.relationship === 'unrelated' ? (
        <p className="mt-4">Intentionally unrelated to your current Purpose Path.</p>
      ) : null}
      {projectBriefSections(project).map(({ label, text }) => (
        <div key={label} className="mt-5">
          <h3 className="font-bold">{label}</h3>
          <p className="mt-2 whitespace-pre-wrap">{text}</p>
        </div>
      ))}
    </section>
  );
}
