import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SegmentRow } from '@/components/editor/SegmentRow';
import type { SegmentWithAlerts } from '@/stores';
import { useSegmentsStore } from '@/stores';

// ── Mock des composants fils complexes ────────────────────────────────────────
vi.mock('@/components/editor/TimecodeInput', () => ({
  TimecodeInput: ({ label }: { label: string }) => (
    <input data-testid={`timecode-${label}`} placeholder={label} />
  ),
}));

vi.mock('@/components/editor/SoundInfoDropdown', () => ({
  SoundInfoDropdown: ({ onInsert }: { onInsert: (s: string) => void }) => (
    <button
      data-testid="sound-info-dropdown"
      onClick={() => onInsert('[musique]')}
    >
      Infos sonores
    </button>
  ),
}));

vi.mock('@/components/editor/SpeakerDropdown', () => ({
  SpeakerDropdown: ({ onSelect }: { onSelect: (s: string | null) => void }) => (
    <button
      data-testid="speaker-dropdown"
      onClick={() => onSelect('FORMATEUR')}
    >
      Locuteur
    </button>
  ),
}));

// ── Mock useSegmentMutation ───────────────────────────────────────────────────
const mockMutateSegment = vi.fn().mockResolvedValue(true);
const mockRollback = vi.fn();

vi.mock('@/hooks', () => ({
  useSegmentMutation: vi.fn(() => ({
    mutateSegment: mockMutateSegment,
    rollback: mockRollback,
    isPending: false,
    isError: false,
    isSuccess: false,
  })),
}));

// ── Mock Zustand store ────────────────────────────────────────────────────────
const mockStartEditing = vi.fn();
const mockStopEditing = vi.fn();
const mockRefreshAllAlerts = vi.fn();

vi.mock('@/stores', () => ({
  useSegmentsStore: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeSegment(overrides: Partial<SegmentWithAlerts> = {}): SegmentWithAlerts {
  return {
    id: 'seg-abc',
    sequenceNum: 1,
    text: 'Bonjour et bienvenue.',
    startMs: 1000,
    endMs: 3000,
    speaker: null,
    isSoundInfo: false,
    fileId: 'file-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    alerts: [],
    ...overrides,
  };
}

function setupStore(editingSegmentId: string | null = null) {
  const mockState = {
      editingSegmentId,
      startEditing: mockStartEditing,
      stopEditing: mockStopEditing,
      refreshAllAlerts: mockRefreshAllAlerts,
    } as unknown as ReturnType<typeof useSegmentsStore.getState>;

  vi.mocked(useSegmentsStore).mockImplementation((selector) => selector(mockState));
}

describe('SegmentRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStore(null);
  });

  describe('rendu de base', () => {
    it('affiche le numéro de séquence', () => {
      render(<SegmentRow segment={makeSegment({ sequenceNum: 3 })} isActive={false} />);
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    it('affiche le texte du segment', () => {
      render(<SegmentRow segment={makeSegment()} isActive={false} />);
      expect(screen.getByText('Bonjour et bienvenue.')).toBeInTheDocument();
    });

    it('affiche les timecodes formatés', () => {
      render(<SegmentRow segment={makeSegment({ startMs: 1000, endMs: 3500 })} isActive={false} />);
      // 1000ms = 00:00:01,000  3500ms = 00:00:03,500
      expect(screen.getByText('00:00:01,000')).toBeInTheDocument();
      expect(screen.getByText('00:00:03,500')).toBeInTheDocument();
    });

    it('affiche le locuteur en préfixe quand speaker est défini', () => {
      render(<SegmentRow segment={makeSegment({ speaker: 'FORMATEUR' })} isActive={false} />);
      expect(screen.getByText('[FORMATEUR]')).toBeInTheDocument();
    });

    it('affiche le texte en italique si c\'est une info sonore', () => {
      render(
        <SegmentRow
          segment={makeSegment({ text: '[musique]', isSoundInfo: true })}
          isActive={false}
        />
      );
      const textEl = screen.getByText('[musique]');
      expect(textEl.className).toContain('italic');
    });
  });

  describe('indicateurs d\'alertes', () => {
    it('affiche CheckCircle quand aucune alerte', () => {
      render(<SegmentRow segment={makeSegment({ alerts: [] })} isActive={false} />);
      expect(screen.getByLabelText('No alerts')).toBeInTheDocument();
    });

    it('affiche AlertCircle rouge pour une alerte critique', () => {
      const alerts = [
        {
          id: 'alert-1',
          fileId: 'file-1',
          segmentId: 'seg-abc',
          ruleCode: 'speed',
          severity: 'critical' as const,
          message: 'Vitesse trop élevée',
          details: null,
          resolved: false,
          resolvedAt: null,
          createdAt: new Date(),
        },
      ];
      render(<SegmentRow segment={makeSegment({ alerts })} isActive={false} />);
      expect(screen.getByLabelText('Critical alert')).toBeInTheDocument();
    });

    it('affiche AlertTriangle orange pour un avertissement', () => {
      const alerts = [
        {
          id: 'alert-2',
          fileId: 'file-1',
          segmentId: 'seg-abc',
          ruleCode: 'duration',
          severity: 'warning' as const,
          message: 'Durée trop courte',
          details: null,
          resolved: false,
          resolvedAt: null,
          createdAt: new Date(),
        },
      ];
      render(<SegmentRow segment={makeSegment({ alerts })} isActive={false} />);
      expect(screen.getByLabelText('Warning')).toBeInTheDocument();
    });

    it('affiche Info bleu pour une alerte info', () => {
      const alerts = [
        {
          id: 'alert-3',
          fileId: 'file-1',
          segmentId: 'seg-abc',
          ruleCode: 'proper_noun',
          severity: 'info' as const,
          message: 'Nom propre potentiel',
          details: null,
          resolved: false,
          resolvedAt: null,
          createdAt: new Date(),
        },
      ];
      render(<SegmentRow segment={makeSegment({ alerts })} isActive={false} />);
      expect(screen.getByLabelText('Info')).toBeInTheDocument();
    });

    it('affiche le nombre d\'alertes dans le badge', () => {
      const alerts = [
        { id: 'a1', fileId: 'f1', segmentId: 'seg-abc', ruleCode: 'speed', severity: 'critical' as const, message: 'err', details: null, resolved: false, resolvedAt: null, createdAt: new Date() },
        { id: 'a2', fileId: 'f1', segmentId: 'seg-abc', ruleCode: 'length', severity: 'warning' as const, message: 'err', details: null, resolved: false, resolvedAt: null, createdAt: new Date() },
      ];
      render(<SegmentRow segment={makeSegment({ alerts })} isActive={false} />);
      expect(screen.getByText('2 alertes')).toBeInTheDocument();
    });
  });

  describe('style segment actif / sélectionné', () => {
    it('applique les classes de style pour le segment actif', () => {
      const { container } = render(
        <SegmentRow segment={makeSegment()} isActive={true} />
      );
      const row = container.firstChild as HTMLElement;
      expect(row.className).toContain('bg-primary/10');
    });

    it('applique les classes de style pour le segment sélectionné', () => {
      const { container } = render(
        <SegmentRow segment={makeSegment()} isActive={false} isSelected={true} />
      );
      const row = container.firstChild as HTMLElement;
      expect(row.className).toContain('bg-blue-50');
    });
  });

  describe('mode édition de texte', () => {
    it('entre en mode édition de texte au clic sur le contenu texte', () => {
      render(<SegmentRow segment={makeSegment()} isActive={false} />);

      const textContent = screen.getByText('Bonjour et bienvenue.');
      fireEvent.click(textContent);

      // After click, should enter edit mode showing a textarea
      expect(screen.getByRole('textbox', { name: /Edit segment text/ })).toBeInTheDocument();
    });

    it('appelle startEditing avec l\'id du segment au clic sur le texte', () => {
      render(<SegmentRow segment={makeSegment({ id: 'seg-xyz' })} isActive={false} />);

      const textContent = screen.getByText('Bonjour et bienvenue.');
      fireEvent.click(textContent);

      expect(mockStartEditing).toHaveBeenCalledWith('seg-xyz');
    });

    it('pré-remplit le textarea avec le texte actuel du segment', () => {
      render(<SegmentRow segment={makeSegment({ text: 'Mon texte existant' })} isActive={false} />);

      fireEvent.click(screen.getByText('Mon texte existant'));

      const textarea = screen.getByRole('textbox', { name: /Edit segment text/ }) as HTMLTextAreaElement;
      expect(textarea.value).toBe('Mon texte existant');
    });

    it('sauvegarde le texte modifié en appuyant sur Enter', async () => {
      render(<SegmentRow segment={makeSegment({ id: 'seg-abc', text: 'Texte original' })} isActive={false} />);

      fireEvent.click(screen.getByText('Texte original'));

      const textarea = screen.getByRole('textbox', { name: /Edit segment text/ });
      fireEvent.change(textarea, { target: { value: 'Nouveau texte modifié' } });
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockMutateSegment).toHaveBeenCalledWith(
          'seg-abc',
          { text: 'Nouveau texte modifié' },
          expect.objectContaining({ debounceMs: 300 })
        );
      });
    });

    it('annule l\'édition en appuyant sur Escape', async () => {
      render(<SegmentRow segment={makeSegment({ text: 'Texte original' })} isActive={false} />);

      fireEvent.click(screen.getByText('Texte original'));
      expect(screen.getByRole('textbox', { name: /Edit segment text/ })).toBeInTheDocument();

      fireEvent.keyDown(
        screen.getByRole('textbox', { name: /Edit segment text/ }),
        { key: 'Escape', code: 'Escape' }
      );

      await waitFor(() => {
        // Back to display mode - shows the original text
        expect(screen.queryByRole('textbox', { name: /Edit segment text/ })).not.toBeInTheDocument();
        expect(screen.getByText('Texte original')).toBeInTheDocument();
      });
    });

    it('appelle rollback lors de l\'annulation de l\'édition', async () => {
      render(<SegmentRow segment={makeSegment({ id: 'seg-abc' })} isActive={false} />);

      fireEvent.click(screen.getByText('Bonjour et bienvenue.'));
      fireEvent.keyDown(
        screen.getByRole('textbox', { name: /Edit segment text/ }),
        { key: 'Escape', code: 'Escape' }
      );

      expect(mockRollback).toHaveBeenCalledWith('seg-abc');
    });

    it('n\'appelle pas mutateSegment si le texte est inchangé', async () => {
      render(<SegmentRow segment={makeSegment({ text: 'Texte inchangé' })} isActive={false} />);

      fireEvent.click(screen.getByText('Texte inchangé'));
      fireEvent.keyDown(
        screen.getByRole('textbox', { name: /Edit segment text/ }),
        { key: 'Enter', code: 'Enter' }
      );

      await waitFor(() => {
        expect(mockMutateSegment).not.toHaveBeenCalled();
      });
    });

    it('entre en mode édition déclenché par le store (Navigation clavier Enter)', async () => {
      setupStore('seg-abc');

      render(<SegmentRow segment={makeSegment({ id: 'seg-abc' })} isActive={true} />);

      // Should be in edit mode due to store
      expect(screen.getByRole('textbox', { name: /Edit segment text/ })).toBeInTheDocument();
    });
  });

  describe('affichage des dropdowns en mode actif', () => {
    it('affiche les dropdowns Locuteur et Infos sonores quand actif', () => {
      render(<SegmentRow segment={makeSegment()} isActive={true} />);
      // Dropdowns are visible on hover (opacity-0 normally, rendered in DOM)
      expect(screen.getByTestId('speaker-dropdown')).toBeInTheDocument();
      expect(screen.getByTestId('sound-info-dropdown')).toBeInTheDocument();
    });

    it('n\'affiche pas les dropdowns quand non actif', () => {
      render(<SegmentRow segment={makeSegment()} isActive={false} />);
      expect(screen.queryByTestId('speaker-dropdown')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sound-info-dropdown')).not.toBeInTheDocument();
    });
  });
});
