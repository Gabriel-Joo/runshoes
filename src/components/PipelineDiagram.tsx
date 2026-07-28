const PipelineDiagram = () => {
  const box = (x: number, y: number, label: string, sub?: string) => (
    <g>
      <rect x={x} y={y} width="180" height="64" className="pd__box" />
      <text x={x + 90} y={sub ? y + 28 : y + 38} className="pd__label">
        {label}
      </text>
      {sub && (
        <text x={x + 90} y={y + 46} className="pd__sub">
          {sub}
        </text>
      )}
    </g>
  );

  return (
    <svg viewBox="0 0 720 380" className="pd" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="pd__head" />
        </marker>
      </defs>

      {box(20, 20, "개발자")}
      {box(270, 20, "GitLab", "std-gitlab")}
      {box(520, 20, "Jenkins", "Kaniko 빌드")}

      {box(520, 160, "Harbor", "이미지 저장소")}
      {box(270, 160, "gitops 레포", "kustomization")}
      {box(20, 160, "ArgoCD", "auto sync")}

      {box(20, 300, "Kubernetes", "vcluster vc-kopo17")}

      <line x1="200" y1="52" x2="264" y2="52" className="pd__line" markerEnd="url(#arrow)" />
      <text x="232" y="42" className="pd__edge">push</text>

      <line x1="450" y1="52" x2="514" y2="52" className="pd__line" markerEnd="url(#arrow)" />
      <text x="482" y="42" className="pd__edge">webhook</text>

      <line x1="610" y1="84" x2="610" y2="154" className="pd__line" markerEnd="url(#arrow)" />
      <text x="650" y="124" className="pd__edge" textAnchor="start">이미지 push</text>

      <line x1="514" y1="192" x2="456" y2="192" className="pd__line" markerEnd="url(#arrow)" />
      <text x="485" y="182" className="pd__edge">태그 커밋</text>

      <line x1="264" y1="192" x2="206" y2="192" className="pd__line" markerEnd="url(#arrow)" />
      <text x="235" y="182" className="pd__edge">감지</text>

      <line x1="110" y1="224" x2="110" y2="294" className="pd__line" markerEnd="url(#arrow)" />
      <text x="130" y="264" className="pd__edge" textAnchor="start">sync</text>
    </svg>
  );
};

export default PipelineDiagram;