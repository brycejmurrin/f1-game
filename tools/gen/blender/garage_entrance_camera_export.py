# @doc Export saved entrance camera F-curves without rebuilding the source.
"""Export saved Blender camera F-curves; no authoring constants are consulted."""
import hashlib,json,math
import bpy

def export_camera(scene,camera,target,source,out):
    curves={fc.array_index:fc for fc in camera.animation_data.action.fcurves if fc.data_path=='location'}
    if set(curves)!={0,1,2}:raise ValueError('Camera needs keyed XYZ location curves')
    keys={i:list(curves[i].keyframe_points) for i in range(3)}
    times=[float(k.co.x) for k in keys[0]]
    if len(times)<2:raise ValueError('Camera needs at least two location keys')
    for i in range(3):
        if [float(k.co.x) for k in keys[i]]!=times:raise ValueError('Camera XYZ key times must match')
    first,last=times[0],times[-1]
    if last<=first:raise ValueError('Camera key times must ascend')
    def game(point):return [float(point[0]),float(point[2]),-float(point[1])]
    segments=[]
    for j in range(len(times)-1):
        span=times[j+1]-times[j]
        if span<=0:raise ValueError('Camera key times must ascend')
        for axis in range(3):
            a,b=keys[axis][j],keys[axis][j+1]
            if a.interpolation!='BEZIER':raise ValueError('Use Bezier interpolation on camera location keys')
            if abs(a.handle_right.x-(times[j]+span/3))>1e-4 or abs(b.handle_left.x-(times[j+1]-span/3))>1e-4:
                raise ValueError('Runtime cubic export requires linear temporal handles at one-third spacing; edit spatial handles only')
        controls=[]
        for attr,index in [('co',j),('handle_right',j),('handle_left',j+1),('co',j+1)]:
            controls.append(game([getattr(keys[axis][index],attr).y for axis in range(3)]))
        segment={'u0':(times[j]-first)/(last-first),'u1':(times[j+1]-first)/(last-first),'points':controls}
        if j==0:segment['sourceEndpoint']=True
        if j==len(times)-2:segment['fitEndpoint']=True
        segments.append(segment)
    rows=[]
    saved_frame=scene.frame_current+scene.frame_subframe
    for index in range(241):
        u=index/240;frame=first+u*(last-first)
        scene.frame_set(int(frame),subframe=frame-int(frame))
        deps=bpy.context.evaluated_depsgraph_get()
        eye=game(camera.evaluated_get(deps).matrix_world.translation)
        aim=game(target.evaluated_get(deps).matrix_world.translation)
        fov=math.degrees(2*math.atan(camera.data.sensor_height/2/camera.data.lens))
        rows.append([u,*eye,*aim,fov])
    scene.frame_set(int(saved_frame),subframe=saved_frame-int(saved_frame))
    result={'status':'proposal-not-runtime-integrated','editableSourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),
      'originalSourceSHA256':scene.get('cameraOriginalSourceSHA256','unrecorded-original'),
      'blender':bpy.app.version_string,'axes':'gameXYZ = BlenderX,Z,-Y; metres',
      'frameRange':[first,last],'previewDurationSeconds':(last-first)/scene.render.fps,
      'columns':['u','eyeX','eyeY','eyeZ','aimX','aimY','aimZ','fovDegrees'],
      'camera':{'version':1,'segments':segments},'rows':rows,
      'runtimeAdaptation':'First segment P0/P1 follow live CUT source; final P2/P3 follow exact fitted endpoint; doorway pins remain fixed',
      'clearanceNotVerified':['all tuner heights/moves/speeds','all viewports/fitted endpoints','other crew variants','animated fan/live atlas','browser culling/projection/continuity']}
    destination=out/'camera-proposal.json'
    destination.write_text(json.dumps(result,indent=2)+'\n')
    return result
