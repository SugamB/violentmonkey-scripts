// ==UserScript==
// @name        LinkedIn jobs filter
// @namespace   Violentmonkey Scripts
// @match       https://www.linkedin.com/jobs/*
// @grant       none
// @version     1.0
// @author      -
// @description 10/1/2024, 2:24:00 AM
// ==/UserScript==

(function() {
    // Delay the execution to allow the page to load completely
    setTimeout(() => {
        // Create a div for the filter controls
        const filterDiv = document.createElement('div');
        filterDiv.style.position = 'fixed';
        filterDiv.style.top = '10px';
        filterDiv.style.right = '10px';
        filterDiv.style.padding = '10px';
        filterDiv.style.backgroundColor = '#fff';
        filterDiv.style.border = '1px solid #ccc';
        filterDiv.style.zIndex = '9999';
        filterDiv.style.boxShadow = '0px 0px 10px rgba(0,0,0,0.1)';

        // Get the job listings
        const jobListings = document.querySelectorAll('li.jobs-search-results__list-item');
        const jobCount = jobListings.length;

        // Create the heading with the total number of listings
        const heading = document.createElement('h3');
        heading.textContent = `Listings: ${jobCount}`;
        filterDiv.appendChild(heading);

        // Create checkboxes
        const filters = ['Applied', 'Viewed', 'Promoted'];
        const filterCheckboxes = {};

        filters.forEach(filter => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `filter-${filter.toLowerCase()}`;
            checkbox.style.marginRight = '5px';

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = filter;

            filterDiv.appendChild(checkbox);
            filterDiv.appendChild(label);
            filterDiv.appendChild(document.createElement('br'));

            filterCheckboxes[filter.toLowerCase()] = checkbox;
        });

        // Append the filter div to the body
        document.body.appendChild(filterDiv);

        // Function to filter jobs based on checkboxes
        const filterJobs = () => {
            jobListings.forEach(listing => {
                let hide = false;

                // Check for each filter's condition
                filters.forEach(filter => {
                    const isChecked = filterCheckboxes[filter.toLowerCase()].checked;
                    const hasFilter = listing.innerText.includes(filter);

                    if (isChecked && hasFilter) {
                        hide = true;
                    }
                });

                // Hide or show the listing
                listing.style.display = hide ? 'none' : '';
            });
        };

        // Add event listeners to checkboxes
        Object.values(filterCheckboxes).forEach(checkbox => {
            checkbox.addEventListener('change', filterJobs);
        });
    }, 2000); // 2-second delay to allow the page to load
})();
