'''
This example shows how to create a neuroglancer URL using the neuroglancer Python module

Needs to be run from the neuroglancer/python directory
'''

import neuroglancer

# https://www.url-encode-decode.com/ is useful for looking at the JSON in the link

# Replicate old links using neuroglancer module:
# https://viz.boss.neurodata.io/#!%7B%22layers%22:%7B%22image%22:%7B%22source%22:%22boss://https://api.boss.neurodata.io/bloss/bloss18/image?%22%2C%22type%22:%22image%22%2C%22blend%22:%22additive%22%7D%7D%2C%22navigation%22:%7B%22pose%22:%7B%22position%22:%7B%22voxelSize%22:%5B3.890000104904175%2C3.890000104904175%2C50%5D%2C%22voxelCoordinates%22:%5B42203.01171875%2C53001%2C160%5D%7D%7D%2C%22zoomFactor%22:3.890000104904175%7D%2C%22layout%22:%22xy%22%7D
# https://viz.boss.neurodata.io/#!{"layers":{"image":{"source":"boss://https://api.boss.neurodata.io/bloss/bloss18/image?","type":"image","blend":"additive"}},"navigation":{"pose":{"position":{"voxelSize":[3.890000104904175,3.890000104904175,50],"voxelCoordinates":[42203.01171875,53001,160]}},"zoomFactor":3.890000104904175},"layout":"xy"}

state = neuroglancer.ViewerState()
state.layers['image'] = neuroglancer.ImageLayer(
    source='boss://https://api.boss.neurodata.io/bloss/bloss18/image')
state.layout = 'xy'
state.voxel_coordinates = [42000, 53780, 200]
print(neuroglancer.to_url(state))
