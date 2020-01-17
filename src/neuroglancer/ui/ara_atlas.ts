/**
 * This is a hard-coded mapping of the ARA3 annotations to human readable name.
 *
 * This data is derived from http://api.brain-map.org/api/v2/structure_graph_download/1.json .
 *
 * TODO: We should write a parser for JSON ontologies.
 *
 */


export class AraAtlas {
    constructor() {
        console.log('Atlas created!');
    }

    public getNameForId(id: number) {
        return this.ara_id.has(id) ? this.ara_id.get(id) : 'UNKNOWN';
    }

    ara_id: Map<number, string> = new Map([
        [1, '1: Midbrain: Tectum'],
        [2, '2: Midbrain: Torus Longitudinalis'],
        [3, '3: Midbrain: Torus Semicircularis'],
        [4, '4: Midbrain: Tegmentum'],
        [5, '5: Hindbrain: Rhombomere 1'],
        [6, '6: Hindbrain: Rhombomere 2'],
        [7, '7: Hindbrain: Rhombomere 3'],
        [8, '8: Hindbrain: Rhombomere 4'],
        [9, '9: Hindbrain: Rhombomere 5'],
        [10, '10: Hindbrain: Rhombomere 6'],
        [11, '11: Hindbrain: Rhombomere 7'],
        [12, '12: Hindbrain: Caudal Hindbrain'],
        [13, '13: Forebrain: Diencephalon'],
        [14, '14: Forebrain: Telencephalon'],
        [15, '15: Forebrain: Olfactory Bulb'],
        [16, '16: Ganglia: Anterior Lateral Line Ganglion'],
        [17, '17: Ganglia: Facial Sensory Ganglion'],
        [18, '18: Ganglia: Facial glossopharyngeal ganglion'],
        [19, '19: Ganglia: Lateral Line Neuromast D1'],
        [20, '20: Ganglia: Lateral Line Neuromast D2'],
        [21, '21: Ganglia: Lateral Line Neuromast N'],
        [22, '22: Ganglia: Lateral Line Neuromast O1'],
        [23, '23: Ganglia: Lateral Line Neuromast OC1'],
        [24, '24: Ganglia: Lateral Line Neuromast SO1'],
        [25, '25: Ganglia: Lateral Line Neuromast SO2'],
        [26, '26: Ganglia: Lateral Line Neuromast SO3'],
        [27, '27: Ganglia: Olfactory Epithelium'],
        [28, '28: Ganglia: Posterior Lateral Line Ganglia'],
        [29, '29: Ganglia: Statoacoustic Ganglion'],
        [30, '30: Ganglia: Trigeminal Ganglion'],
        [31, '31: Ganglia: Vagal Ganglia'],
        [32, '32: Spinal Cord: Spinal Cord'],
        [33, '33: Retina: Retina']
    ]);

}
