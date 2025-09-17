/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const DEFAULT_PROFILES_PATH =
  'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles';

import {
  PROFILES_LIST,
  getProfile as getGeneratedProfile,
} from './generated-profiles.js';
const DEFAULT_PROFILE = 'generic-trigger';
const PROFILE_LIST_NAME = 'profilesList.json';

type ComponentState = 'default' | 'touched' | 'pressed';
type ValueNodeProperty = 'transform' | 'visibility';
type GamepadIndexKeys = 'button' | 'xAxis' | 'yAxis';

export interface InputComponentConfig {
  type: 'trigger' | 'squeeze' | 'thumbstick' | 'touchpad' | 'button';
  gamepadIndices: Partial<{ [id in GamepadIndexKeys]: number }>;
  rootNodeName: string;
  touchPointNodeName?: string;
  visualResponses: {
    [id: string]: {
      componentProperty: 'button' | 'xAxis' | 'yAxis' | 'state';
      states: ComponentState[];
      valueNodeProperty: ValueNodeProperty;
      valueNodeName: string;
      minNodeName?: string;
      maxNodeName?: string;
    };
  };
}

export interface InputLayout {
  selectComponentId: string;
  components: { [id: string]: InputComponentConfig };
  rootNodeName: string;
  gamepadMapping: 'xr-standard' | '';
  assetPath: string;
}

export interface InputProfile {
  profileId: string;
  fallbackProfileIds: string[];
  layouts: Partial<{ [handedness in XRHandedness]: InputLayout }>;
}

export async function fetchJsonFile(path: string): Promise<InputProfile> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(response.statusText);
  } else {
    return response.json();
  }
}

export async function fetchProfilesList(
  basePath: string = DEFAULT_PROFILES_PATH,
): Promise<any> {
  const profilesList = await fetchJsonFile(`${basePath}/${PROFILE_LIST_NAME}`);
  return profilesList;
}

type FetchProfileOptions = {
  basePath?: string;
  defaultProfile?: string;
  getAssetPath?: boolean;
};

export function fetchProfileSync(
  inputSource: XRInputSource,
  {
    defaultProfile = DEFAULT_PROFILE,
  }: Omit<FetchProfileOptions, 'basePath'> = {},
): InputProfile {
  const supportedProfilesList = PROFILES_LIST;

  let match:
    | {
        profileId: string;
        profilePath: string;
        deprecated: boolean;
      }
    | undefined;
  inputSource.profiles.some((profileId) => {
    const supportedProfile = supportedProfilesList[profileId];
    if (supportedProfile) {
      match = {
        profileId,
        profilePath: supportedProfile.path,
        deprecated: !!supportedProfile.deprecated,
      };
    }
    return !!match;
  });

  if (!match) {
    const supportedProfile = supportedProfilesList[defaultProfile];
    if (!supportedProfile) {
      throw new Error(
        `No matching profile name found and default profile "${defaultProfile}" missing.`,
      );
    }

    match = {
      profileId: defaultProfile,
      profilePath: supportedProfile.path,
      deprecated: !!supportedProfile.deprecated,
    };
  }

  const profile = getGeneratedProfile(match.profilePath);
  return profile;
}

export async function fetchProfile(
  inputSource: XRInputSource,
  {
    basePath = DEFAULT_PROFILES_PATH,
    defaultProfile = DEFAULT_PROFILE,
  }: FetchProfileOptions,
): Promise<InputProfile> {
  const supportedProfilesList = await fetchProfilesList(basePath);

  let match:
    | {
        profileId: string;
        profilePath: string;
        deprecated: boolean;
      }
    | undefined;
  inputSource.profiles.some((profileId) => {
    const supportedProfile = supportedProfilesList[profileId];
    if (supportedProfile) {
      match = {
        profileId,
        profilePath: `${basePath}/${supportedProfile.path}`,
        deprecated: !!supportedProfile.deprecated,
      };
    }
    return !!match;
  });

  if (!match) {
    const supportedProfile = supportedProfilesList[defaultProfile];
    if (!supportedProfile) {
      throw new Error(
        `No matching profile name found and default profile "${defaultProfile}" missing.`,
      );
    }

    match = {
      profileId: defaultProfile,
      profilePath: `${basePath}/${supportedProfile.path}`,
      deprecated: !!supportedProfile.deprecated,
    };
  }

  const profile = await fetchJsonFile(match.profilePath);
  return profile;
}

export function loadInputProfile(inputSource: XRInputSource) {
  const profileId = inputSource.profiles[0];
  let profile = fetchProfileSync(inputSource);
  const layout = profile.layouts[inputSource.handedness];
  if (!layout) {
    throw new DOMException('No applicable layout found', 'NotSupportedError');
  }
  return {
    inputSource,
    layout,
    profileId,
    resolvedProfileId: profile.profileId,
    assetPath: `${DEFAULT_PROFILES_PATH}/${profile.profileId}/${layout.assetPath}`,
  };
}
