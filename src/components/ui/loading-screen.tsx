export function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-label="Carregando seus dados">
      <div className="loading-header" />
      <div className="loading-stats">
        {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
      </div>
      <div className="loading-grid" />
    </div>
  );
}
