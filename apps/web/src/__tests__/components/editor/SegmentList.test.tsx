import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentList } from '@/components/editor/SegmentList';
import type { SegmentWithAlerts } from '@/stores';

// ── Mock virtualizer ─────────────────────────────────────────────────────────
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn((config: { count: number }) => {
    const items = Array.from({ length: config.count }, (_, i) => ({
      index: i,
      start: i * 100,
      size: 100,
      key: `virtual-item-${i}`,
      lane: 0,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => config.count * 100,
      scrollToIndex: vi.fn(),
      measureElement: vi.fn(),
    };
  }),
}));

// ── Mock Zustand store ────────────────────────────────────────────────────────
const mockStoreState = {
  segments: [] as SegmentWithAlerts[],
  activeIndex: 0,
  isLoading: false,
  editingSegmentId: null as string | null,
  selectedSegmentIds: new Set<string>(),
  setActiveIndex: vi.fn(),
  startEditing: vi.fn(),
  selectRange: vi.fn(),
  toggleSegmentSelection: vi.fn(),
  clearSelection: vi.fn(),
  canMergeSelection: vi.fn(() => ({ canMerge: false, error: 'Sélectionnez exactement 2 segments' })),
  getSelectedSegments: vi.fn(() => []),
};

vi.mock('@/stores', () => ({
  useSegmentsStore: vi.fn((selector: (state: typeof mockStoreState) => unknown) =>
    selector(mockStoreState)
  ),
}));

// ── Mock hooks ────────────────────────────────────────────────────────────────
vi.mock('@/hooks', () => ({
  useKeyboardNavigation: vi.fn(() => ({ setIsEditing: vi.fn() })),
}));

// ── Mock SegmentRow to simplify rendering ────────────────────────────────────
vi.mock('@/components/editor/SegmentRow', () => ({
  SegmentRow: ({ segment }: { segment: SegmentWithAlerts }) => (
    <div data-testid={`segment-row-${segment.id}`}>
      #{segment.sequenceNum} — {segment.text}
    </div>
  ),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeSegment(id: string, sequenceNum: number, text: string): SegmentWithAlerts {
  return {
    id,
    sequenceNum,
    text,
    startMs: sequenceNum * 2000,
    endMs: sequenceNum * 2000 + 1500,
    speaker: null,
    isSoundInfo: false,
    fileId: 'file-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    alerts: [],
  };
}

describe('SegmentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.segments = [];
    mockStoreState.activeIndex = 0;
    mockStoreState.isLoading = false;
    mockStoreState.editingSegmentId = null;
    mockStoreState.selectedSegmentIds = new Set();
  });

  describe('état chargement', () => {
    it('affiche le spinner de chargement quand isLoading=true', () => {
      mockStoreState.isLoading = true;
      render(<SegmentList />);
      expect(screen.getByText(/Chargement des segments/)).toBeInTheDocument();
    });
  });

  describe('état vide', () => {
    it('affiche le message Aucun segment quand la liste est vide', () => {
      mockStoreState.segments = [];
      render(<SegmentList />);
      expect(screen.getByText(/Aucun segment à afficher/)).toBeInTheDocument();
    });

    it('affiche l\'invite à importer un fichier SRT/VTT', () => {
      mockStoreState.segments = [];
      render(<SegmentList />);
      expect(screen.getByText(/Importez un fichier SRT\/VTT/)).toBeInTheDocument();
    });
  });

  describe('rendu des segments', () => {
    it('rend tous les segments présents dans le store', () => {
      mockStoreState.segments = [
        makeSegment('seg-1', 1, 'Premier segment'),
        makeSegment('seg-2', 2, 'Deuxième segment'),
        makeSegment('seg-3', 3, 'Troisième segment'),
      ];

      render(<SegmentList />);

      expect(screen.getByTestId('segment-row-seg-1')).toBeInTheDocument();
      expect(screen.getByTestId('segment-row-seg-2')).toBeInTheDocument();
      expect(screen.getByTestId('segment-row-seg-3')).toBeInTheDocument();
    });

    it('rend le numéro de séquence et le texte du segment', () => {
      mockStoreState.segments = [
        makeSegment('seg-1', 1, 'Bonjour tout le monde'),
      ];

      render(<SegmentList />);
      expect(screen.getByText(/#1 — Bonjour tout le monde/)).toBeInTheDocument();
    });

    it('rend la liste avec le rôle listbox', () => {
      mockStoreState.segments = [makeSegment('seg-1', 1, 'Test')];
      render(<SegmentList />);
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('rend le conteneur avec le label aria adéquat', () => {
      mockStoreState.segments = [makeSegment('seg-1', 1, 'Test')];
      render(<SegmentList />);
      expect(screen.getByLabelText('Liste des segments')).toBeInTheDocument();
    });
  });

  describe('barre d\'outils de fusion', () => {
    it('n\'affiche pas la barre de fusion quand aucun segment n\'est sélectionné', () => {
      mockStoreState.segments = [
        makeSegment('seg-1', 1, 'Segment 1'),
        makeSegment('seg-2', 2, 'Segment 2'),
      ];
      mockStoreState.selectedSegmentIds = new Set();

      render(<SegmentList />);
      expect(screen.queryByText(/sélectionné/)).not.toBeInTheDocument();
    });

    it('affiche la barre de fusion quand des segments sont sélectionnés', () => {
      mockStoreState.segments = [
        makeSegment('seg-1', 1, 'Segment 1'),
        makeSegment('seg-2', 2, 'Segment 2'),
      ];
      mockStoreState.selectedSegmentIds = new Set(['seg-1', 'seg-2']);

      render(<SegmentList />);
      expect(screen.getByText(/2 segments sélectionnés/)).toBeInTheDocument();
    });

    it('affiche le bouton Fusionner dans la barre d\'outils de sélection', () => {
      mockStoreState.segments = [
        makeSegment('seg-1', 1, 'Segment 1'),
        makeSegment('seg-2', 2, 'Segment 2'),
      ];
      mockStoreState.selectedSegmentIds = new Set(['seg-1', 'seg-2']);

      render(<SegmentList />);
      expect(screen.getByRole('button', { name: /Fusionner/ })).toBeInTheDocument();
    });

    it('affiche le bouton Annuler la sélection', () => {
      mockStoreState.segments = [makeSegment('seg-1', 1, 'Segment 1')];
      mockStoreState.selectedSegmentIds = new Set(['seg-1']);

      render(<SegmentList />);
      expect(screen.getByRole('button', { name: /Annuler/ })).toBeInTheDocument();
    });
  });

  describe('gestion d\'un grand nombre de segments (scroll)', () => {
    it('rend 50 segments grâce à la virtualisation', () => {
      mockStoreState.segments = Array.from({ length: 50 }, (_, i) =>
        makeSegment(`seg-${i + 1}`, i + 1, `Segment numéro ${i + 1}`)
      );

      render(<SegmentList />);

      // All 50 segments should be rendered via the mock virtualizer
      expect(screen.getByTestId('segment-row-seg-1')).toBeInTheDocument();
      expect(screen.getByTestId('segment-row-seg-50')).toBeInTheDocument();
    });
  });
});
