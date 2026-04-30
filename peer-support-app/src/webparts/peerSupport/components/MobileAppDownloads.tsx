import * as React from 'react';
import * as QRCode from 'qrcode';
import { DefaultButton } from '@fluentui/react';
import styles from './MobileAppDownloads.module.scss';
import { PEERPOINT_ANDROID_STORE_URL, PEERPOINT_IOS_STORE_URL } from './mobileAppLinks';

export type MobileAppDownloadsVariant = 'strip' | 'page';

export type MobileAppDownloadsProps = {
  /** `strip`: compact band under contact bar. `page`: larger QR on the Mobile apps route. */
  variant: MobileAppDownloadsVariant;
};

export function MobileAppDownloads(props: MobileAppDownloadsProps): React.ReactElement {
  const { variant } = props;
  const [iosDataUrl, setIosDataUrl] = React.useState('');
  const [androidDataUrl, setAndroidDataUrl] = React.useState('');
  const qrSize = variant === 'page' ? 200 : 128;

  React.useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        const [i, a] = await Promise.all([
          QRCode.toDataURL(PEERPOINT_IOS_STORE_URL, { margin: 1, width: qrSize }),
          QRCode.toDataURL(PEERPOINT_ANDROID_STORE_URL, { margin: 1, width: qrSize })
        ]);
        if (!cancelled) {
          setIosDataUrl(i);
          setAndroidDataUrl(a);
        }
      } catch {
        if (!cancelled) {
          setIosDataUrl('');
          setAndroidDataUrl('');
        }
      }
    };
    run().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [qrSize]);

  const rootClass = variant === 'page' ? `${styles.wrap} ${styles.wrapPage}` : styles.wrap;

  return (
    <section className={rootClass} aria-label="Download PEERPoint mobile apps">
      <div className={styles.inner}>
        <h3 className={styles.title}>iPhone and Android (includes chat)</h3>
        <p className={styles.blurb}>
          This SharePoint web part does <strong>not</strong> include live chat. Install the <strong>PEERPoint</strong>{' '}
          mobile app for chat-capable peer support—especially when you are <strong>off duty</strong> and want the
          fastest path from your personal phone. Scan a code or use the store buttons below (IT replaces placeholder
          links with your live App Store and Google Play URLs when published).
        </p>
        <div className={styles.grid}>
          <div className={styles.card}>
            <span className={styles.storeName}>iPhone / iPad</span>
            {iosDataUrl ? (
              <img className={styles.qr} src={iosDataUrl} alt="QR code to open the PEERPoint iOS App Store listing" width={qrSize} height={qrSize} />
            ) : null}
            <DefaultButton href={PEERPOINT_IOS_STORE_URL} target="_blank" rel="noreferrer" text="App Store listing" />
          </div>
          <div className={styles.card}>
            <span className={styles.storeName}>Android</span>
            {androidDataUrl ? (
              <img
                className={styles.qr}
                src={androidDataUrl}
                alt="QR code to open the PEERPoint Google Play listing"
                width={qrSize}
                height={qrSize}
              />
            ) : null}
            <DefaultButton href={PEERPOINT_ANDROID_STORE_URL} target="_blank" rel="noreferrer" text="Google Play listing" />
          </div>
        </div>
        {variant === 'strip' ? (
          <div className={styles.stripActions}>
            <DefaultButton text="More about mobile apps & chat" href="#/mobile-apps" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
