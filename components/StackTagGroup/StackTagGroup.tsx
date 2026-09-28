import type { DeclaredSuiteStatus } from '../../lib/projects/schema';
import styles from './StackTagGroup.module.css';

export interface StackItem {
  name: string;
  // Set when the tool matches a declared suite, which exists but does not report yet.
  declaredStatus?: DeclaredSuiteStatus;
}

export interface StackGroup {
  category: string;
  items: readonly StackItem[];
}

export interface StackTagGroupProps {
  // built: the dev stack. tested: the test stack.
  variant: 'built' | 'tested';
  groups: readonly StackGroup[];
}

const DECLARED_SUFFIX: Record<DeclaredSuiteStatus, string> = {
  authored_not_executed: 'not yet executed',
  runs_in_ci_not_reported: 'not yet reported',
};

export function StackTagGroup({ variant, groups }: StackTagGroupProps) {
  return (
    <dl className={`${styles.group} ${styles[variant]}`} data-variant={variant}>
      {groups.map((group) => (
        <div key={group.category} className={styles.pair}>
          <dt className={styles.category}>{group.category}</dt>
          <dd className={styles.cell}>
            <ul className={styles.tags}>
              {group.items.map((item, index) => (
                <li
                  // A tool can appear twice, once per declared suite status.
                  key={`${item.name}-${index}`}
                  className={[styles.tag, item.declaredStatus && styles.declared]
                    .filter(Boolean)
                    .join(' ')}
                  data-part="tag"
                  data-declared={item.declaredStatus}
                >
                  {item.declaredStatus
                    ? `${item.name} · ${DECLARED_SUFFIX[item.declaredStatus]}`
                    : item.name}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}
