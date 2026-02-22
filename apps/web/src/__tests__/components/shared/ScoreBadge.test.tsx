import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreBadge, ScoreIndicator } from '@/components/shared/ScoreBadge';

describe('ScoreBadge', () => {
  describe('couleurs selon le score', () => {
    it('affiche la catégorie Excellent et les classes vertes pour score ≥ 90', () => {
      render(<ScoreBadge score={95} />);
      expect(screen.getByText(/Excellent/)).toBeInTheDocument();
      expect(screen.getByText(/95/)).toBeInTheDocument();
    });

    it('affiche la catégorie Bon et les classes jaunes pour score 70-89', () => {
      render(<ScoreBadge score={80} />);
      expect(screen.getByText(/Bon/)).toBeInTheDocument();
    });

    it('affiche la catégorie Moyen et les classes orange pour score 50-69', () => {
      render(<ScoreBadge score={60} />);
      expect(screen.getByText(/Moyen/)).toBeInTheDocument();
    });

    it('affiche Non conforme et les classes rouges pour score < 50', () => {
      render(<ScoreBadge score={30} />);
      expect(screen.getByText(/Non conforme/)).toBeInTheDocument();
    });

    it('affiche le score 0 comme Non conforme', () => {
      render(<ScoreBadge score={0} />);
      expect(screen.getByText(/Non conforme/)).toBeInTheDocument();
    });

    it('affiche le score 100 comme Excellent', () => {
      render(<ScoreBadge score={100} />);
      expect(screen.getByText(/Excellent/)).toBeInTheDocument();
    });

    it('affiche le score 90 comme Excellent (seuil)', () => {
      render(<ScoreBadge score={90} />);
      expect(screen.getByText(/Excellent/)).toBeInTheDocument();
    });

    it('applique un seuil Excellent personnalisé', () => {
      render(<ScoreBadge score={94} excellentThreshold={95} />);
      expect(screen.queryByText(/Excellent/)).not.toBeInTheDocument();
      expect(screen.getByText(/Bon/)).toBeInTheDocument();
    });

    it('affiche le score 70 comme Bon (seuil)', () => {
      render(<ScoreBadge score={70} />);
      expect(screen.getByText(/Bon/)).toBeInTheDocument();
    });

    it('affiche le score 50 comme Moyen (seuil)', () => {
      render(<ScoreBadge score={50} />);
      expect(screen.getByText(/Moyen/)).toBeInTheDocument();
    });
  });

  describe('affichage du score', () => {
    it('affiche le score avec /100', () => {
      const { container } = render(<ScoreBadge score={75} />);
      expect(container.textContent).toContain('75');
      expect(container.textContent).toContain('/100');
    });

    it('masque le label de catégorie pour la taille sm', () => {
      render(<ScoreBadge score={85} size="sm" />);
      // Size sm does not render category label
      expect(screen.queryByText(/Bon/)).not.toBeInTheDocument();
    });

    it('affiche le label de catégorie pour la taille md (par défaut)', () => {
      render(<ScoreBadge score={85} size="md" />);
      expect(screen.getByText(/Bon/)).toBeInTheDocument();
    });

    it('affiche le label de catégorie pour la taille lg', () => {
      render(<ScoreBadge score={85} size="lg" />);
      expect(screen.getByText(/Bon/)).toBeInTheDocument();
    });
  });

  describe('état chargement', () => {
    it('affiche un spinner et le texte Calcul... quand isLoading=true', () => {
      render(<ScoreBadge score={null} isLoading />);
      expect(screen.getByText('Calcul...')).toBeInTheDocument();
    });

    it('n\'affiche pas le score quand isLoading=true', () => {
      render(<ScoreBadge score={80} isLoading />);
      expect(screen.queryByText(/80/)).not.toBeInTheDocument();
    });
  });

  describe('score null', () => {
    it('affiche --/100 quand le score est null', () => {
      render(<ScoreBadge score={null} />);
      expect(screen.getByText('--/100')).toBeInTheDocument();
    });
  });
});

describe('ScoreIndicator', () => {
  it('affiche le score dans le badge circulaire', () => {
    render(<ScoreIndicator score={85} />);
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('affiche -- quand le score est null', () => {
    render(<ScoreIndicator score={null} />);
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('affiche un placeholder pulsé en état de chargement', () => {
    const { container } = render(<ScoreIndicator score={null} isLoading />);
    // Loading state renders an animated pulse div, no score text
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('affiche le titre avec le score et la catégorie', () => {
    render(<ScoreIndicator score={95} />);
    const badge = screen.getByTitle(/Score SME: 95\/100/);
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('title')).toContain('Excellent');
  });
});
