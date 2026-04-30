export function FitScore({ score }: { score: number }) {
  const cls = score >= 7.5 ? "hi" : score >= 5.5 ? "mid" : "lo";
  return (
    <span className={`sp-score ${cls}`}>
      {score.toFixed(1)}
      <span className="sp-score-bar">
        <span className="sp-score-fill" style={{ width: `${score * 10}%` }} />
      </span>
    </span>
  );
}
