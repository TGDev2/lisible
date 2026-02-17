import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuotaBadge } from '@/components/shared/QuotaBadge';

// Mock useQuota hook
vi.mock('@/hooks/useQuota', () => ({
  useQuota: vi.fn(),
}));

import { useQuota } from '@/hooks/useQuota';
const mockUseQuota = vi.mocked(useQuota);

const makeQuotaData = (percentUsed: number, available = 0, rollover = 0) => ({
  plan: 'free',
  credits: {
    total: 30,
    used: Math.round(30 * percentUsed / 100),
    available,
    rollover,
    percentUsed,
  },
  resetAt: null,
});

describe('QuotaBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('état chargement', () => {
    it('affiche le skeleton en cours de chargement', () => {
      mockUseQuota.mockReturnValue({
        quota: null,
        isLoading: true,
        error: null,
        refresh: vi.fn(),
      });

      const { container } = render(<QuotaBadge />);
      // Shows animated pulse elements
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('état erreur / pas de données', () => {
    it('ne rend rien en cas d\'erreur (retour null)', () => {
      mockUseQuota.mockReturnValue({
        quota: null,
        isLoading: false,
        error: 'Erreur réseau',
        refresh: vi.fn(),
      });

      const { container } = render(<QuotaBadge />);
      expect(container.firstChild).toBeNull();
    });

    it('ne rend rien quand quota est null sans erreur', () => {
      mockUseQuota.mockReturnValue({
        quota: null,
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      });

      const { container } = render(<QuotaBadge />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('couleurs selon le pourcentage utilisé', () => {
    it('affiche en vert quand moins de 50% est utilisé (> 50% restant)', () => {
      mockUseQuota.mockReturnValue({
        quota: makeQuotaData(30, 21), // 30% utilisé → vert
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      });

      const { container } = render(<QuotaBadge />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('bg-green-50');
    });

    it('affiche en orange quand 50-79% est utilisé (> 20% restant)', () => {
      mockUseQuota.mockReturnValue({
        quota: makeQuotaData(60, 12), // 60% utilisé → orange
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      });

      const { container } = render(<QuotaBadge />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('bg-orange-50');
    });

    it('affiche en rouge quand ≥ 80% est utilisé (≤ 20% restant)', () => {
      mockUseQuota.mockReturnValue({
        quota: makeQuotaData(85, 5), // 85% utilisé → rouge
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      });

      const { container } = render(<QuotaBadge />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('bg-red-50');
    });
  });

  describe('affichage du quota', () => {
    it('affiche le nombre de minutes restantes', () => {
      mockUseQuota.mockReturnValue({
        quota: makeQuotaData(40, 18),
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      });

      render(<QuotaBadge />);
      expect(screen.getByText(/18 min restantes/)).toBeInTheDocument();
    });

    it('affiche la barre de progression avec le bon pourcentage', () => {
      mockUseQuota.mockReturnValue({
        quota: makeQuotaData(60, 12),
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      });

      render(<QuotaBadge />);
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '60');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('affiche le label aria avec les minutes restantes', () => {
      mockUseQuota.mockReturnValue({
        quota: makeQuotaData(40, 18),
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      });

      render(<QuotaBadge />);
      expect(screen.getByLabelText(/18 min restantes/)).toBeInTheDocument();
    });

    it('affiche le rollover quand il existe', () => {
      mockUseQuota.mockReturnValue({
        quota: {
          plan: 'pro',
          credits: {
            total: 200,
            used: 5,
            available: 205,
            rollover: 10,
            percentUsed: 2,
          },
          resetAt: null,
        },
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      });

      render(<QuotaBadge />);
      // Should mention rollover in label
      expect(screen.getByText(/rollover/)).toBeInTheDocument();
    });
  });
});
