document.addEventListener('DOMContentLoaded', function() {
    fetchTeams();
    startTeamMemberRefresh();
});

function fetchTeams() {
    fetch('/api/teams', { credentials: 'include' })
        .then(response => response.json())
        .then(teams => {
            const teamsContainer = document.getElementById('teams-container');
            teamsContainer.innerHTML = '';
            teams.forEach(team => {
                const teamElement = createTeamElement(team);
                teamsContainer.appendChild(teamElement);
            });
        })
        .catch(error => console.error('Error fetching teams:', error));
}

function createTeamElement(team) {
    const teamDiv = document.createElement('div');
    teamDiv.className = 'team-card';
    teamDiv.setAttribute('data-team-id', team.id);
    teamDiv.innerHTML = `
        <h2 class="team-name">${team.name}</h2>
        <ul class="member-list space-y-2" id="team-${team.id}-members"></ul>
    `;
    fetchTeamMembers(team.id, teamDiv.querySelector(`#team-${team.id}-members`));
    return teamDiv;
}

function fetchTeamMembers(teamId, memberListElement) {
    fetch(`/api/teams/${teamId}/members`, { credentials: 'include' })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(members => {
            memberListElement.innerHTML = '';
            members.forEach(member => {
                const memberItem = document.createElement('li');
                memberItem.className = 'member-item';
                memberItem.innerHTML = `
                    <span class="font-semibold">${member.name}</span>
                `;
                memberListElement.appendChild(memberItem);
            });
        })
        .catch(error => {
            console.error('Error fetching team members:', error);
            memberListElement.innerHTML = '<li>Error loading team members. Please try again later.</li>';
        });
}

function startTeamMemberRefresh() {
    setInterval(() => {
        const teamContainers = document.querySelectorAll('.team-card');
        teamContainers.forEach(container => {
            const teamId = container.getAttribute('data-team-id');
            const memberList = container.querySelector('.member-list');
            if (teamId && memberList) {
                fetchTeamMembers(teamId, memberList);
            }
        });
    }, 60000); // Refresh every 60 seconds
}
