import * as React from 'react';
import { DefaultButton, Panel, PanelType } from '@fluentui/react';
import styles from './PrivacyPromisePanel.module.scss';

export type PrivacyPromisePanelProps = {
  isOpen: boolean;
  onDismiss: () => void;
};

export function PrivacyPromisePanel(props: PrivacyPromisePanelProps): React.ReactElement {
  const { isOpen, onDismiss } = props;

  return (
    <Panel
      isOpen={isOpen}
      onDismiss={onDismiss}
      type={PanelType.medium}
      headerText="Our privacy promise"
      closeButtonAriaLabel="Close privacy promise"
      isBlocking={true}
      onRenderFooterContent={() => (
        <DefaultButton text="Close" onClick={onDismiss} ariaLabel="Close privacy promise" />
      )}
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          We take confidentiality seriously. Please read this promise before you use PEERPoint.
        </p>

        <h3 className={styles.h3}>Who can see personal identifying information (PII)?</h3>
        <p>
          <strong>Only the Salt Lake County Sheriff’s Office Licensed Therapist</strong> is authorized to access{' '}
          <strong>personal identifying information</strong> used for <strong>signing in</strong> to this app, or that
          you enter in <strong>fields intended for personal identifying information</strong> (for example the name,
          phone, and email fields on the Request Help form).
        </p>
        <p>
          Other screens may show <strong>non-identifying</strong> request information to authorized peer support or
          HR staff according to your agency’s assignment and visibility rules—they are not the same as the PII covered
          above.
        </p>

        <h3 className={styles.h3}>Your responsibility</h3>
        <p>
          <strong>You must not enter PII</strong> (for example full names, addresses, badge numbers, or contact
          details) in <strong>open text fields</strong> or other areas that are <strong>not</strong> meant for that
          information—such as general description boxes—unless you understand and accept that those fields may be visible
          to authorized peer support staff according to agency policy and visibility settings.
        </p>
        <p>
          If you are unsure where to put something sensitive, use the designated contact fields, use Email / Call /
          Text above, or ask your peer support coordinator.
        </p>

        <h3 className={styles.h3}>General</h3>
        <p>
          This tool is for employees. Use follows Salt Lake County Sheriff’s Office and County policies. Nothing here
          replaces emergency services: in an immediate emergency, call <strong>911</strong>.
        </p>
      </div>
    </Panel>
  );
}
