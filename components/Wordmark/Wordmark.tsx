import styles from './Wordmark.module.css';

// The site's name inside a header link (design/components.md, "Site name, wordmark and page
// titles", v20): "Test" and "ament" drawn by weight, which a screen reader would read as two
// words, so the drawing is hidden from it and the name is said once, unsplit.
export function Wordmark() {
  return (
    <>
      <span aria-hidden="true" data-part="wordmark-shown">
        Test
        <span className={styles.light} data-part="wordmark-light">
          ament
        </span>
      </span>
      <span className={styles.spoken} data-part="wordmark-spoken">
        Testament
      </span>
    </>
  );
}
